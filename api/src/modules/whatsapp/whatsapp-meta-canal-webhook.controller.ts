import {
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
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
import { WhatsappCanaisService } from './whatsapp-canais.service';
import { MetaCloudProvider } from './meta-cloud.provider';
import { InstagramProvider } from './instagram.provider';
import { MessengerProvider } from './messenger.provider';
import { InboundMessage } from './whatsapp-provider.interface';
import { QUEUE_ATENDIMENTO, JOB_ATEND_PROCESSAR_MENSAGEM } from '../queue/queue.constants';

const IDEMPOTENCIA_TTL = 60 * 60 * 24; // 24h

/**
 * Webhook da Meta Cloud API por CANAL individual (multi-número).
 *
 * URL configurada no app Meta de cada número:
 *   https://<host>/api/webhooks/meta-canal/{secret}
 *
 * O path `meta-canal` (irmão de `meta`) distingue este endpoint do webhook por
 * slug existente (/webhooks/meta/{slug}/{secret}) e EVITA a colisão de rota:
 * `webhooks/meta/c/{secret}` seria capturado por `webhooks/meta/:tenant/:secret`
 * (tenant='c'), por isso usamos um path próprio.
 *
 * - GET  → handshake de verificação (hub.mode=subscribe + hub.verify_token + hub.challenge).
 * - POST → mensagens; valida X-Hub-Signature-256 com o App Secret do canal (se definido);
 *          idempotência por wamid; acha/cria conversa com canalId; enfileira job.
 *
 * Cross-tenant justificado: o webhook chega sem TenantContext; resolvemos o canal
 * (e o tenant) pelo webhook_secret UNIQUE via prisma.platform(), depois criamos
 * o TenantContext para todo processamento subsequente.
 */
@Controller('webhooks/meta-canal')
export class WhatsappMetaCanalWebhookController {
  private readonly log = new Logger(WhatsappMetaCanalWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly canaisService: WhatsappCanaisService,
    private readonly conversaService: AtendimentoConversaService,
    private readonly agente: AtendimentoWhatsappAgenteService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  // ------------------------------------------------------------- verificação (GET handshake)

  /**
   * A Meta chama GET com hub.mode=subscribe, hub.verify_token e hub.challenge.
   * Resolve o canal pelo path-secret; valida verify_token; ecoa o challenge.
   */
  @Get(':secret')
  async verificar(
    @Param('secret') secret: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): Promise<void> {
    const canal = await this.canaisService.canalPorWebhookSecret(secret);

    if (
      !canal ||
      mode !== 'subscribe' ||
      !canal.metaVerifyToken ||
      !this.cmp(verifyToken ?? '', canal.metaVerifyToken)
    ) {
      this.log.warn(`Webhook canal: verificação negada (secret hash ${secret?.slice(0, 8)}…).`);
      res.status(404).send('Not Found');
      return;
    }

    // Echo do challenge em texto puro (exigência da Meta).
    res.status(200).type('text/plain').send(challenge ?? '');
  }

  // ------------------------------------------------------------- mensagens (POST)

  @Post(':secret')
  async receber(
    @Param('secret') secret: string,
    @Headers('x-hub-signature-256') assinatura: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: boolean }> {
    const canal = await this.canaisService.canalPorWebhookSecret(secret);

    if (!canal) {
      this.log.warn(`Webhook canal: secret desconhecido (hash ${secret?.slice(0, 8)}…).`);
      throw new NotFoundException();
    }

    // Validação de assinatura HMAC quando o App Secret do canal está definido.
    const raw = req.rawBody;
    if (canal.metaAppSecret) {
      if (!raw || !this.assinaturaValida(raw, assinatura, canal.metaAppSecret)) {
        this.log.warn(`Webhook canal: assinatura X-Hub-Signature-256 inválida (canal ${canal.id}).`);
        throw new NotFoundException();
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // Responde 200 rápido; a Meta reentrega em caso de timeout.
    setImmediate(() =>
      this.processar(canal.tenantId, canal.id, canal.secretariaId ?? null, body).catch((e) =>
        this.log.error(`Webhook canal [${canal.id}] processamento: ${(e as Error).message}`),
      ),
    );

    return { ok: true };
  }

  // ------------------------------------------------------------- núcleo

  private async processar(
    tenantId: string,
    canalId: string,
    secretariaId: string | null,
    body: Record<string, unknown>,
  ) {
    // Detecta o tipo de payload pelo campo `object`.
    const objectType = (body as { object?: string }).object ?? '';
    const ehInstagram = objectType === 'instagram';
    const ehMessenger = objectType === 'page';

    // Parseia com o provider adequado ao tipo de payload.
    let inbound: InboundMessage | null = null;
    if (ehInstagram) {
      inbound = new InstagramProvider(null as never, { pageOrIgId: '', token: '' }).parseInbound(body);
    } else if (ehMessenger) {
      inbound = new MessengerProvider(null as never, { pageId: '', token: '' }).parseInbound(body);
    } else {
      inbound = new MetaCloudProvider(null as never, { phoneNumberId: '', token: '' }).parseInbound(body);
    }

    if (!inbound) {
      this.log.debug(`Webhook canal [${canalId}]: payload sem mensagem (status/echo) — tenant ${tenantId}.`);
      return;
    }

    // Idempotência por messageId (wamid/mid) — a Meta reentrega em retries.
    const idKey = `wa:in:${inbound.messageId}`;
    const novo = await redisCommands.set(idKey, '1', 'EX', IDEMPOTENCIA_TTL, 'NX');
    if (!novo) {
      this.log.debug(`Webhook canal [${canalId}]: messageId '${inbound.messageId}' duplicado, ignorado.`);
      return;
    }

    // Instagram e Messenger usam PSID — não normalizar como telefone.
    // WhatsApp normaliza para somente dígitos.
    const ehPSID = ehInstagram || ehMessenger;
    const identificador = ehPSID ? inbound.from : inbound.from.replace(/\D/g, '');
    if (!identificador) return;

    // Tipo de canal: 'instagram', 'messenger' ou 'whatsapp'.
    const canalTipo: 'instagram' | 'messenger' | 'whatsapp' = ehInstagram
      ? 'instagram'
      : ehMessenger
        ? 'messenger'
        : 'whatsapp';

    // Detecção de agente — apenas para WhatsApp (PSID de Instagram/Messenger não é número de telefone).
    // O ouvidor atende SOMENTE pelo WhatsApp da prefeitura, não por Instagram/Messenger (spec B).
    if (!ehPSID) {
      const textoAgente = inbound.texto?.slice(0, 5000) ?? '';
      if (await this.agente.tentarRotearComoAgente(tenantId, identificador, textoAgente, canalId)) {
        return;
      }
    }

    await TenantContext.run({ tenantId }, async () => {
      // Busca conversa ativa pelo (canal, número/PSID) — prioriza o canal de origem.
      let conversa = await this.prisma.db.atendimentoConversa.findFirst({
        where: {
          canal: canalTipo,
          canalId,
          visitanteIdentificador: identificador,
          status: { not: 'encerrada' },
        },
        orderBy: { iniciadaEm: 'desc' },
      });

      if (!conversa) {
        const result = await this.conversaService.iniciarComCanal({
          tenantId,
          canal: canalTipo,
          canalId,
          visitanteTelefone: ehPSID ? undefined : identificador,
          visitanteIdentificador: identificador,
          visitanteNome: inbound.nome,
          secretariaId: secretariaId ?? undefined,
        });
        conversa = await this.prisma.db.atendimentoConversa.findUnique({
          where: { id: result.id },
        });
      }

      if (!conversa) {
        this.log.warn(`Webhook canal [${canalId}]: não foi possível criar conversa para ${identificador}.`);
        return;
      }

      const texto = inbound.texto?.slice(0, 5000) ?? '[mensagem sem texto]';
      const msg = await this.conversaService.persistirMensagem(conversa.id, tenantId, {
        autorTipo: 'visitante',
        conteudo: texto,
      });

      await this.fila.add(
        JOB_ATEND_PROCESSAR_MENSAGEM,
        {
          conversaId: conversa.id,
          mensagemId: msg.id,
          tenantId,
          canalId, // passado no payload para que o bot/worker roteie a resposta pelo canal correto
        },
        {
          jobId: `atend-msg-${msg.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      );
    });
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
