import {
  Controller,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisCommands } from '../queue/redis.config';
import { AtendimentoConversaService } from '../atendimento/atendimento-conversa.service';
import { AtendimentoWhatsappAgenteService } from '../atendimento/atendimento-whatsapp-agente.service';
import { ContatosService } from '../notificacoes/contatos.service';
import { WhatsappCanaisService } from './whatsapp-canais.service';
import { TelegramProvider } from './telegram.provider';
import { QUEUE_ATENDIMENTO, JOB_ATEND_PROCESSAR_MENSAGEM } from '../queue/queue.constants';

/**
 * Regex para reconhecer código de vínculo Telegram enviado por um funcionário.
 * Aceita: "123456", "/vincular 123456", "/start 123456".
 * Captura o código numérico de 6 dígitos no grupo 1.
 */
const RE_VINCULO_CODIGO = /^\/?(vincular|start)\s+(\d{6})$|^(\d{6})$/i;

const IDEMPOTENCIA_TTL = 60 * 60 * 24; // 24h

/**
 * Webhook do Telegram Bot API por canal individual.
 *
 * URL configurada via setWebhook na Bot API:
 *   https://<host>/api/webhooks/telegram/{webhook_secret}
 *
 * - POST /api/webhooks/telegram/:secret → recebe updates do Telegram.
 *   Valida o header X-Telegram-Bot-Api-Secret-Token contra metaVerifyToken.
 *   Idempotência por update_id/message_id. Acha/cria conversa com canal='telegram'.
 *   Enfileira JOB_ATEND_PROCESSAR_MENSAGEM. Responde rápido (Telegram reentrega em erro).
 *
 * Não há handshake GET — o Telegram não faz verificação de challenge.
 *
 * Cross-tenant justificado: o webhook chega sem TenantContext; resolvemos o canal
 * (e o tenant) pelo webhook_secret UNIQUE via prisma.platform(), depois criamos
 * o TenantContext para todo processamento subsequente.
 *
 * Detecção de agente: antes de processar como cidadão, chama
 * AtendimentoWhatsappAgenteService.tentarRotearComoAgente com canalTipo='telegram'.
 * Apenas agentes com telegram_verificado=true são reconhecidos (anti-spoofing).
 *
 * NUNCA logar o bot token em claro.
 */
@Controller('webhooks/telegram')
export class TelegramWebhookController {
  private readonly log = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly canaisService: WhatsappCanaisService,
    private readonly conversaService: AtendimentoConversaService,
    private readonly agente: AtendimentoWhatsappAgenteService,
    private readonly contatos: ContatosService,
    private readonly http: HttpService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  @Post(':secret')
  async receber(
    @Param('secret') secret: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const canal = await this.canaisService.canalPorWebhookSecret(secret);

    if (!canal || canal.tipo !== 'telegram') {
      this.log.warn(`Webhook Telegram: secret desconhecido ou tipo errado (hash ${secret?.slice(0, 8)}…).`);
      throw new NotFoundException();
    }

    // Valida o secret_token enviado pelo Telegram (se metaVerifyToken definido).
    if (canal.metaVerifyToken) {
      if (!secretToken || !this.cmp(secretToken, canal.metaVerifyToken)) {
        this.log.warn(`Webhook Telegram: X-Telegram-Bot-Api-Secret-Token inválido (canal ${canal.id}).`);
        throw new NotFoundException();
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // Acknowledge imediato do callback_query para remover o "relógio" no botão
    // (best-effort — antes do processamento assíncrono para resposta mais rápida).
    const callbackQueryId = (body.callback_query as { id?: string } | undefined)?.id;
    if (callbackQueryId && canal.metaToken) {
      const provider = new TelegramProvider(this.http, { token: canal.metaToken });
      provider.answerCallback(callbackQueryId).catch(() => void 0);
    }

    // Responde 200 imediatamente — Telegram reentrega se não receber 2xx rapidamente.
    setImmediate(() =>
      this.processar(canal.tenantId, canal.id, canal.secretariaId ?? null, canal.metaToken ?? null, body).catch((e) =>
        this.log.error(`Webhook Telegram [${canal.id}] processamento: ${(e as Error).message}`),
      ),
    );

    return { ok: true };
  }

  private async processar(
    tenantId: string,
    canalId: string,
    secretariaId: string | null,
    canalToken: string | null,
    body: Record<string, unknown>,
  ) {
    const inbound = new TelegramProvider(null as never, { token: '' }).parseInbound(body);

    if (!inbound) {
      this.log.debug(`Webhook Telegram [${canalId}]: update sem texto — tenant ${tenantId}.`);
      return;
    }

    // Idempotência por messageId do Telegram.
    const idKey = `wa:in:tg:${inbound.messageId}`;
    const novo = await redisCommands.set(idKey, '1', 'EX', IDEMPOTENCIA_TTL, 'NX');
    if (!novo) {
      this.log.debug(`Webhook Telegram [${canalId}]: messageId '${inbound.messageId}' duplicado, ignorado.`);
      return;
    }

    const identificador = inbound.from;
    if (!identificador) return;

    // Detecção de código de vínculo — ANTES de agente e cidadão.
    // Qualquer mensagem de texto que case com o padrão é tratada como tentativa
    // de vínculo do funcionário (ex.: "123456" ou "/vincular 123456").
    if (inbound.texto) {
      const matchVinculo = inbound.texto.trim().match(RE_VINCULO_CODIGO);
      if (matchVinculo) {
        // Grupo 2 = after /vincular|/start; grupo 3 = digits-only format.
        const codigo = matchVinculo[2] ?? matchVinculo[3];
        try {
          const resultado = await this.contatos.vincularTelegramPorCodigo(tenantId, codigo, identificador);
          if (resultado.ok) {
            const nomeStr = resultado.nome ? `, ${resultado.nome}` : '';
            if (canalToken) {
              const provider = new TelegramProvider(this.http, { token: canalToken });
              await provider
                .sendText(
                  identificador,
                  `Telegram vinculado${nomeStr}! Voce ja pode atender por aqui (digite AJUDA).`,
                )
                .catch(() => void 0);
            }
            return; // consumido — não trata como agente nem cidadão
          }
          // Código inválido/expirado: não interrompe o fluxo (pode ser mensagem legítima "123456")
        } catch (e) {
          this.log.warn(
            `Webhook Telegram [${canalId}]: erro ao tentar vínculo código=${codigo?.slice(0, 3)}xxx: ${(e as Error).message}`,
          );
        }
      }
    }

    // Detecção de agente — ANTES de criar conversa de cidadão.
    // Só roteamos quando há texto (comandos/respostas); outros tipos seguem fluxo normal.
    if (inbound.texto) {
      const foiAgente = await this.agente.tentarRotearComoAgente(
        tenantId,
        identificador,
        inbound.texto,
        canalId,
        'telegram',
      );
      if (foiAgente) return;
    }

    await TenantContext.run({ tenantId }, async () => {
      // Busca conversa ativa pelo (canal, chat_id).
      let conversa = await this.prisma.db.atendimentoConversa.findFirst({
        where: {
          canal: 'telegram',
          canalId,
          visitanteIdentificador: identificador,
          status: { not: 'encerrada' },
        },
        orderBy: { iniciadaEm: 'desc' },
      });

      if (!conversa) {
        const result = await this.conversaService.iniciarComCanal({
          tenantId,
          canal: 'telegram',
          canalId,
          // Telegram usa chat_id, não telefone — visitanteTelefone fica vazio.
          visitanteIdentificador: identificador,
          visitanteNome: inbound.nome,
          secretariaId: secretariaId ?? undefined,
        });
        conversa = await this.prisma.db.atendimentoConversa.findUnique({
          where: { id: result.id },
        });
      }

      if (!conversa) {
        this.log.warn(`Webhook Telegram [${canalId}]: não foi possível criar conversa para ${identificador}.`);
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
          canalId,
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
