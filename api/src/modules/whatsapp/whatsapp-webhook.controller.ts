import {
  Body,
  Controller,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  forwardRef,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisCommands } from '../queue/redis.config';
import { AtendimentoConversaService } from '../atendimento/atendimento-conversa.service';
import { AtendimentoWhatsappAgenteService } from '../atendimento/atendimento-whatsapp-agente.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { ZApiProvider } from './zapi.provider';
import { EvolutionProvider } from './evolution.provider';
import { InboundMessage } from './whatsapp-provider.interface';
import { QUEUE_ATENDIMENTO, JOB_ATEND_PROCESSAR_MENSAGEM } from '../queue/queue.constants';

const IDEMPOTENCIA_TTL = 60 * 60 * 24; // 24h — evita duplicata mesmo com retry do provider

/**
 * Webhook de entrada da Z-API (server-to-server — sem auth de sessão JWT).
 * Protegido por path-secret (timingSafeEqual) + idempotência por messageId.
 *
 * Rotas:
 *   POST /webhooks/zapi/:tenant/:secret/:evento   (sub-paths por evento)
 *   POST /webhooks/zapi/:tenant/:secret           (update-every-webhooks — type no body)
 *
 * Proteção por IP: responsabilidade da borda (Cloudflare). Documentado no runbook.
 *
 * Cross-tenant justificado: webhook chega sem TenantContext HTTP;
 * usamos prisma.platform() para resolver tenant por slug → validamos secret →
 * toda operação subsequente roda dentro de TenantContext.run().
 */
@Controller('webhooks/zapi')
export class WhatsappWebhookController {
  private readonly log = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: WhatsappConfigService,
    @Inject(forwardRef(() => AtendimentoConversaService))
    private readonly conversaService: AtendimentoConversaService,
    @Inject(forwardRef(() => AtendimentoWhatsappAgenteService))
    private readonly agente: AtendimentoWhatsappAgenteService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  /** Rota com sub-path de evento explícito: /webhooks/zapi/:tenant/:secret/:evento */
  @Post(':tenant/:secret/:evento')
  async receberComEvento(
    @Param('tenant') slug: string,
    @Param('secret') secret: string,
    @Param('evento') evento: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.processar(slug, secret, evento, body);
  }

  /** Rota sem sub-path (update-every-webhooks): /webhooks/zapi/:tenant/:secret */
  @Post(':tenant/:secret')
  async receberSemEvento(
    @Param('tenant') slug: string,
    @Param('secret') secret: string,
    @Body() body: Record<string, unknown>,
  ) {
    // Evento discriminado pelo campo `type` do payload
    const evento = String(body.type ?? body.event ?? 'unknown');
    return this.processar(slug, secret, evento, body);
  }

  // ---------------------------------------------------------------- núcleo

  private async processar(
    slug: string,
    secret: string,
    evento: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    // 1. Resolver config do tenant por slug (cross-tenant)
    const cfg = await this.configService.configPorSlug(slug);
    // 2. Validar secret (timing-safe — evita timing attack). Resposta GENÉRICA
    // (404) tanto para slug inexistente quanto para secret inválido — não revela
    // qual dos dois falhou (anti-enumeração).
    if (!cfg || !cfg.zapiWebhookSecret || !this.secretValido(secret, cfg.zapiWebhookSecret)) {
      this.log.warn(`Webhook Z-API: acesso negado para slug '${slug}'.`);
      throw new NotFoundException();
    }

    // 3. Responde 200 rápido; processa assíncrono
    setImmediate(() =>
      this.rotear(cfg.tenantId, slug, evento, body, cfg).catch((e) =>
        this.log.error(`Webhook Z-API processamento: ${(e as Error).message}`),
      ),
    );
    return { ok: true };
  }

  private async rotear(
    tenantId: string,
    _slug: string,
    evento: string,
    body: Record<string, unknown>,
    cfg: Awaited<ReturnType<WhatsappConfigService['configPorSlug']>>,
  ) {
    const tipo = String(body.type ?? evento ?? '');

    if (tipo === 'ReceivedCallback' || evento === 'on-receive') {
      await this.processarMensagemRecebida(tenantId, body, cfg!);
      return;
    }

    if (
      tipo === 'MessageStatusCallback' ||
      tipo === 'DeliveryCallback' ||
      evento === 'message-status' ||
      evento === 'on-send'
    ) {
      // Auditoria de status — sem PII
      await this.auditarStatus(tenantId, tipo || evento);
      return;
    }

    if (tipo === 'ConnectedCallback' || evento === 'connected') {
      this.log.log(`WhatsApp instância conectada (tenant ${tenantId}).`);
      await this.auditarStatus(tenantId, 'WHATSAPP_CONECTADO');
      return;
    }

    if (tipo === 'DisconnectedCallback' || evento === 'disconnected') {
      this.log.warn(`WhatsApp instância DESCONECTADA (tenant ${tenantId}).`);
      await this.auditarStatus(tenantId, 'WHATSAPP_DESCONECTADO');
      return;
    }

    // Evento desconhecido — ignora silenciosamente
    this.log.debug(`Webhook Z-API: evento '${tipo || evento}' ignorado (tenant ${tenantId}).`);
  }

  private async processarMensagemRecebida(
    tenantId: string,
    body: Record<string, unknown>,
    cfg: NonNullable<Awaited<ReturnType<WhatsappConfigService['configPorSlug']>>>,
  ) {
    // Seleciona parser correto pelo provider configurado
    let inbound: InboundMessage | null = null;
    if (cfg.provider === 'zapi') {
      const parser = new ZApiProvider(null as any, {
        baseUrl: '',
        instanceId: cfg.zapiInstanceId ?? '',
        token: '',
        clientToken: '',
      });
      inbound = parser.parseInbound(body);
    } else {
      const parser = new EvolutionProvider(null as any, {
        apiUrl: '',
        instance: '',
        apiKey: '',
      });
      inbound = parser.parseInbound(body);
    }

    if (!inbound) {
      this.log.debug(`Webhook Z-API: payload não é mensagem recebida (tenant ${tenantId}).`);
      return;
    }

    // Valida instância quando disponível (anti-spoofing multi-tenant)
    if (inbound.instancia && cfg.zapiInstanceId && inbound.instancia !== cfg.zapiInstanceId) {
      this.log.warn(
        `Webhook Z-API: instância '${inbound.instancia}' não corresponde a config (tenant ${tenantId}).`,
      );
      return;
    }

    // Idempotência por messageId
    const idKey = `wa:in:${inbound.messageId}`;
    const novo = await redisCommands.set(idKey, '1', 'EX', IDEMPOTENCIA_TTL, 'NX');
    if (!novo) {
      this.log.debug(`Webhook Z-API: messageId '${inbound.messageId}' duplicado, ignorado.`);
      return;
    }

    const identificador = inbound.from.replace(/\D/g, '');
    if (!identificador) return;

    const texto = inbound.texto?.slice(0, 5000) ?? '[mensagem sem texto]';

    // Detecção de agente — ANTES de criar conversa de cidadão.
    // Se o remetente for um ouvidor/assistente/admin verificado, trata como
    // mensagem de agente (comandos ou resposta ao cidadão) e interrompe o fluxo.
    if (await this.agente.tentarRotearComoAgente(tenantId, identificador, texto)) {
      return;
    }

    // Acha ou cria conversa
    let conversa = await TenantContext.run({ tenantId }, async () => {
      return this.prisma.db.atendimentoConversa.findFirst({
        where: {
          canal: 'whatsapp',
          visitanteIdentificador: identificador,
          status: { not: 'encerrada' },
        },
        orderBy: { iniciadaEm: 'desc' },
      });
    });

    if (!conversa) {
      const result = await this.conversaService.iniciar({
        tenantId,
        canal: 'whatsapp',
        visitanteTelefone: identificador,
        visitanteIdentificador: identificador,
        visitanteNome: inbound.nome,
      });
      conversa = await TenantContext.run({ tenantId }, () =>
        this.prisma.db.atendimentoConversa.findUnique({ where: { id: result.id } }),
      );
    }

    if (!conversa) {
      this.log.warn(`Webhook Z-API: não foi possível criar conversa para ${identificador}`);
      return;
    }

    const msg = await this.conversaService.persistirMensagem(conversa.id, tenantId, {
      autorTipo: 'visitante',
      conteudo: texto,
    });

    await this.fila.add(
      JOB_ATEND_PROCESSAR_MENSAGEM,
      { conversaId: conversa.id, mensagemId: msg.id, tenantId },
      {
        jobId: `atend-msg-${msg.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
  }

  // ---------------------------------------------------------------- helpers

  private secretValido(recebido: string, esperado: string): boolean {
    try {
      const a = Buffer.from(recebido, 'utf8');
      const b = Buffer.from(esperado, 'utf8');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private async auditarStatus(tenantId: string, acao: string): Promise<void> {
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao,
            entidade: 'whatsapp',
            entidadeId: null,
            dados: {} as object,
          } as any,
        }),
      );
    } catch {
      // best-effort
    }
  }
}
