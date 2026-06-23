import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { QUEUE_CHAT, JOB_CHAT_BOT_RESPONDER } from '../queue/queue.constants';
import { ChatBotService } from './chat-bot.service';

interface BotResponderPayload {
  conversaId: string;
  mensagemId: string;
  tenantId: string;
}

/**
 * Worker da fila `chat` — Assistente do Portal.
 * Processa JOB_CHAT_BOT_RESPONDER: dado (conversaId, mensagemId, tenantId),
 * delega ao ChatBotService.processarMensagem que monta o histórico, chama a IA
 * no modo interno e persiste a resposta como mensagem do bot.
 *
 * Dead-letter: falhas que esgotam as tentativas são registradas em audit_log.
 */
@Processor(QUEUE_CHAT, { concurrency: 3 })
export class ChatBotWorker extends WorkerHost {
  private readonly log = new Logger(ChatBotWorker.name);

  constructor(
    private readonly botService: ChatBotService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_CHAT_BOT_RESPONDER) {
      const { conversaId, mensagemId, tenantId } = job.data as BotResponderPayload;
      if (!tenantId || !conversaId || !mensagemId) return;

      await TenantContext.run({ tenantId }, () =>
        this.botService.processarMensagem(conversaId, mensagemId, tenantId),
      );
    }
  }

  /** Dead-letter: falhas esgotadas registram em audit_log. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const tenantId = job.data?.tenantId as string | undefined;
    if (!tenantId) return;
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao: 'CHAT_BOT_JOB_FALHOU',
            entidade: 'chat_mensagens',
            entidadeId: job.data?.mensagemId ?? null,
            dados: {
              jobName: job.name,
              erro: error.message,
              conversaId: job.data?.conversaId,
              mensagemId: job.data?.mensagemId,
            } as object,
          } as any,
        }),
      );
    } catch {
      // best-effort — não propagar erro no handler de erro
    }
  }
}
