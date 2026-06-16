import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { timingSafeEqual, createHmac } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { QUEUE_ATENDIMENTO, JOB_ATEND_PROCESSAR_MENSAGEM } from '../queue/queue.constants';

/**
 * Webhook da Evolution API (WhatsApp).
 * POST /webhook/evolution/:instancia
 *
 * Segurança: valida HMAC-SHA256 no header X-Evolution-Signature.
 * Resolve tenant pelo campo evolution_instancia.
 * Cria/acha conversa pelo número do remetente e enfileira processamento.
 *
 * Cross-tenant justificado: o webhook chega sem TenantContext (HTTP externo);
 * usamos prisma.platform() para resolver o tenant pelo campo evolution_instancia.
 * Após resolução, toda operação subsequente usa TenantContext.run().
 */
@Controller('webhook')
export class WebhookEvolutionController {
  private readonly log = new Logger(WebhookEvolutionController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversaService: AtendimentoConversaService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  @Post('evolution/:instancia')
  async receberEvento(
    @Param('instancia') instancia: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-evolution-signature') assinatura: string | undefined,
  ) {
    // 1. Validar HMAC (usa o body serializado como fallback — rawBody requer config em main.ts)
    if (!this.validarHmac(Buffer.from(JSON.stringify(body)), assinatura)) {
      throw new BadRequestException('Assinatura inválida.');
    }

    // 2. Extrair dados do payload da Evolution API defensivamente
    const evento = String(body.event ?? body.type ?? '');
    // Ignorar eventos que não são mensagem recebida
    if (!evento.toLowerCase().includes('message') || evento.toLowerCase().includes('update')) {
      return { ok: true, ignorado: true };
    }

    const numero = this.extrairNumero(body);
    const texto = this.extrairTexto(body);

    if (!numero || !texto) {
      return { ok: true, ignorado: true };
    }

    // 3. Resolver tenant por evolution_instancia (cross-tenant justificado: resolução de webhook)
    const tenant = await this.prisma.platform().tenant.findFirst({
      where: { evolutionInstancia: instancia },
      select: { id: true, atendimentoHumanoAtivo: true },
    });

    if (!tenant || !tenant.atendimentoHumanoAtivo) {
      return { ok: true, ignorado: true };
    }

    const tenantId = tenant.id;

    // 4. Achar ou criar conversa por número (identificador = número E.164)
    const identificador = numero.replace(/\D/g, '');

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
      // Cria nova conversa via service (grava saudação etc.)
      const result = await this.conversaService.iniciar({
        tenantId,
        canal: 'whatsapp',
        visitanteTelefone: identificador,
        visitanteIdentificador: identificador,
      });
      conversa = await TenantContext.run({ tenantId }, () =>
        this.prisma.db.atendimentoConversa.findUnique({ where: { id: result.id } }),
      );
    }

    if (!conversa) {
      this.log.warn(`Webhook Evolution: não foi possível criar conversa para ${identificador}`);
      return { ok: false };
    }

    // 5. Grava a mensagem do visitante
    const msg = await this.conversaService.persistirMensagem(conversa.id, tenantId, {
      autorTipo: 'visitante',
      conteudo: texto.slice(0, 5000),
    });

    // 6. Enfileira processamento (assíncrono — resposta rápida ao webhook)
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

    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private validarHmac(corpo: Buffer, assinatura: string | undefined): boolean {
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? process.env.AUTH_JWT_SECRET;
    if (!secret) {
      this.log.warn('EVOLUTION_WEBHOOK_SECRET não configurado — aceitando sem validação HMAC.');
      return true;
    }
    if (!assinatura) return false;

    const buf = corpo;
    const esperado = createHmac('sha256', secret).update(buf).digest('hex');

    const aRecebida = assinatura.replace(/^sha256=/, '');
    try {
      return timingSafeEqual(
        Buffer.from(esperado, 'hex'),
        Buffer.from(aRecebida, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /** Extrai o número do remetente do payload da Evolution API. */
  private extrairNumero(body: Record<string, unknown>): string | null {
    // Payload típico da Evolution: body.data.key.remoteJid ou body.key.remoteJid
    try {
      const data = (body.data ?? body) as Record<string, unknown>;
      const key = (data.key ?? {}) as Record<string, unknown>;
      const jid = (key.remoteJid ?? data.remoteJid ?? '') as string;
      // Remove sufixo @s.whatsapp.net ou @g.us (grupos)
      const numero = jid.split('@')[0];
      return numero || null;
    } catch {
      return null;
    }
  }

  /** Extrai o texto da mensagem do payload da Evolution API. */
  private extrairTexto(body: Record<string, unknown>): string | null {
    try {
      const data = (body.data ?? body) as Record<string, unknown>;
      const msg = (data.message ?? {}) as Record<string, unknown>;
      // Tenta os campos mais comuns
      const texto =
        (msg.conversation as string) ||
        ((msg.extendedTextMessage as any)?.text as string) ||
        (data.text as string) ||
        (body.text as string) ||
        null;
      return texto ?? null;
    } catch {
      return null;
    }
  }
}
