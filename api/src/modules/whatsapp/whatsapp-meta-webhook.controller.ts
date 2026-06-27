import {
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  forwardRef,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisCommands } from '../queue/redis.config';
import { AtendimentoConversaService } from '../atendimento/atendimento-conversa.service';
import { AtendimentoWhatsappAgenteService } from '../atendimento/atendimento-whatsapp-agente.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { MetaCloudProvider } from './meta-cloud.provider';
import { QUEUE_ATENDIMENTO, JOB_ATEND_PROCESSAR_MENSAGEM } from '../queue/queue.constants';

const IDEMPOTENCIA_TTL = 60 * 60 * 24; // 24h

/**
 * Webhook da API OFICIAL da Meta (WhatsApp Cloud API).
 *
 * URL configurada no app Meta de cada prefeitura:
 *   https://<host>/api/webhooks/meta/{slug}/{secret}
 *
 * - GET  → handshake de verificação (hub.mode/hub.verify_token/hub.challenge).
 * - POST → mensagens; valida a assinatura HMAC-SHA256 (X-Hub-Signature-256)
 *          sobre o CORPO CRU (req.rawBody) usando o App Secret do tenant.
 *
 * Defesa em camadas: segredo no PATH (resolve o tenant, timing-safe) +
 * assinatura HMAC (integridade/autenticidade Meta) + idempotência por messageId.
 * Cross-tenant justificado: o webhook chega sem TenantContext; resolvemos por
 * slug com prisma.platform() e validamos antes de processar.
 */
@Controller('webhooks/meta')
export class WhatsappMetaWebhookController {
  private readonly log = new Logger(WhatsappMetaWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: WhatsappConfigService,
    @Inject(forwardRef(() => AtendimentoConversaService))
    private readonly conversaService: AtendimentoConversaService,
    @Inject(forwardRef(() => AtendimentoWhatsappAgenteService))
    private readonly agente: AtendimentoWhatsappAgenteService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  // ------------------------------------------------------------- verificação
  /**
   * GET handshake: a Meta chama com hub.mode=subscribe & hub.verify_token & hub.challenge.
   * Devolve o challenge cru se o verify_token bater com o do tenant; senão 404.
   */
  @Get(':tenant/:secret')
  async verificar(
    @Param('tenant') slug: string,
    @Param('secret') secret: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): Promise<void> {
    const cfg = await this.configService.configPorSlug(slug);
    if (
      !cfg ||
      !cfg.metaWebhookSecret ||
      !this.cmp(secret, cfg.metaWebhookSecret) ||
      mode !== 'subscribe' ||
      !cfg.metaVerifyToken ||
      !this.cmp(verifyToken ?? '', cfg.metaVerifyToken)
    ) {
      this.log.warn(`Webhook Meta: verificação negada para slug '${slug}'.`);
      res.status(404).send('Not Found');
      return;
    }
    // Echo do challenge em texto puro (exigência da Meta).
    res.status(200).type('text/plain').send(challenge ?? '');
  }

  // ------------------------------------------------------------- mensagens
  @Post(':tenant/:secret')
  async receber(
    @Param('tenant') slug: string,
    @Param('secret') secret: string,
    @Headers('x-hub-signature-256') assinatura: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: boolean }> {
    const cfg = await this.configService.configPorSlug(slug);
    if (!cfg || !cfg.metaWebhookSecret || !this.cmp(secret, cfg.metaWebhookSecret)) {
      this.log.warn(`Webhook Meta: path-secret inválido para slug '${slug}'.`);
      throw new NotFoundException();
    }

    // Validação de assinatura HMAC quando o App Secret está configurado.
    const raw = req.rawBody;
    if (cfg.metaAppSecret) {
      if (!raw || !this.assinaturaValida(raw, assinatura, cfg.metaAppSecret)) {
        this.log.warn(`Webhook Meta: assinatura X-Hub-Signature-256 inválida (slug '${slug}').`);
        throw new NotFoundException();
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Responde 200 rápido e processa assíncrono (a Meta reentrega em caso de timeout).
    setImmediate(() =>
      this.processar(cfg.tenantId, body).catch((e) =>
        this.log.error(`Webhook Meta processamento: ${(e as Error).message}`),
      ),
    );
    return { ok: true };
  }

  // ------------------------------------------------------------- núcleo
  private async processar(tenantId: string, body: Record<string, unknown>) {
    const inbound = new MetaCloudProvider(null as never, {
      phoneNumberId: '',
      token: '',
    }).parseInbound(body);
    if (!inbound) {
      this.log.debug(`Webhook Meta: payload sem mensagem (status/echo) — tenant ${tenantId}.`);
      return;
    }

    // Idempotência por messageId (wamid) — a Meta reentrega em retries.
    const idKey = `wa:in:${inbound.messageId}`;
    const novo = await redisCommands.set(idKey, '1', 'EX', IDEMPOTENCIA_TTL, 'NX');
    if (!novo) {
      this.log.debug(`Webhook Meta: messageId '${inbound.messageId}' duplicado, ignorado.`);
      return;
    }

    const identificador = inbound.from.replace(/\D/g, '');
    if (!identificador) return;

    const texto = inbound.texto?.slice(0, 5000) ?? '[mensagem sem texto]';

    // Detecção de agente — ANTES de criar conversa de cidadão.
    if (await this.agente.tentarRotearComoAgente(tenantId, identificador, texto)) {
      return;
    }

    let conversa = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.atendimentoConversa.findFirst({
        where: {
          canal: 'whatsapp',
          visitanteIdentificador: identificador,
          status: { not: 'encerrada' },
        },
        orderBy: { iniciadaEm: 'desc' },
      }),
    );

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
      this.log.warn(`Webhook Meta: não foi possível criar conversa para ${identificador}.`);
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

  // ------------------------------------------------------------- helpers
  private assinaturaValida(raw: Buffer, header: string | undefined, appSecret: string): boolean {
    if (!header?.startsWith('sha256=')) return false;
    const esperado = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
    return this.cmp(header, esperado);
  }

  private cmp(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a, 'utf8');
      const bb = Buffer.from(b, 'utf8');
      if (ba.length !== bb.length) return false;
      return timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  }
}
