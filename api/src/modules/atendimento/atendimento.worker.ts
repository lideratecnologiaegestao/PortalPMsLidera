import { OnWorkerEvent, Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  QUEUE_ATENDIMENTO,
  JOB_ATEND_PROCESSAR_MENSAGEM,
  JOB_ATEND_INATIVIDADE,
} from '../queue/queue.constants';
import { AtendimentoBotService } from './atendimento-bot.service';
import { AtendimentoConversaService } from './atendimento-conversa.service';

interface ProcessarMensagemPayload {
  conversaId: string;
  mensagemId: string;
  tenantId: string;
}

/**
 * Worker da fila `atendimento`.
 * - atend.processar_mensagem: roda o bot para mensagens de visitante.
 * - atend.inatividade_check: encerra conversas sem atividade (cron).
 * Dead-letter registrado em audit_log via @OnWorkerEvent('failed').
 */
@Processor(QUEUE_ATENDIMENTO, { concurrency: 5 })
export class AtendimentoWorker extends WorkerHost implements OnModuleInit {
  private readonly log = new Logger(AtendimentoWorker.name);

  constructor(
    private readonly bot: AtendimentoBotService,
    private readonly conversas: AtendimentoConversaService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {
    super();
  }

  /**
   * Agenda o job de inatividade como repeat (cron a cada 5 min) na inicialização.
   * Idempotente: BullMQ não duplica jobs com mesmo repeatJobKey.
   */
  async onModuleInit() {
    try {
      await this.fila.add(
        JOB_ATEND_INATIVIDADE,
        {},
        {
          repeat: { every: 5 * 60 * 1000 }, // 5 minutos
          jobId: 'inatividade-check-repeat',
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 100 },
        },
      );
      this.log.log('Job de inatividade agendado (repeat 5min).');
    } catch (e) {
      this.log.warn(`Não foi possível agendar job de inatividade: ${(e as Error).message}`);
    }
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_ATEND_PROCESSAR_MENSAGEM) {
      const { conversaId, mensagemId, tenantId } = job.data as ProcessarMensagemPayload;
      if (!tenantId || !conversaId || !mensagemId) return;
      await TenantContext.run({ tenantId }, () =>
        this.bot.processarMensagem(conversaId, mensagemId, tenantId),
      );
      return;
    }

    if (job.name === JOB_ATEND_INATIVIDADE) {
      await this.verificarInatividade();
      return;
    }
  }

  /**
   * Verifica e encerra conversas inativas em todos os tenants.
   * Para cada tenant, lê atendimento_inatividade_min e encerra conversas
   * cuja ultima_atividade_em excedeu o limite.
   */
  private async verificarInatividade() {
    // Busca todos os tenants com atendimento ativo (cross-tenant via platform())
    const tenants = await this.prisma
      .platform()
      .tenant.findMany({
        where: { atendimentoHumanoAtivo: true },
        select: { id: true, atendimentoInatividadeMin: true },
      });

    for (const tenant of tenants) {
      try {
        const limiteMin = tenant.atendimentoInatividadeMin ?? 30;
        const limite = new Date(Date.now() - limiteMin * 60 * 1000);

        const conversasInativas = await TenantContext.run(
          { tenantId: tenant.id },
          () =>
            this.prisma.db.atendimentoConversa.findMany({
              where: {
                status: { in: ['bot', 'aguardando_agente', 'em_atendimento'] },
                ultimaAtividadeEm: { lt: limite },
              },
              select: { id: true },
            }),
        );

        for (const c of conversasInativas) {
          try {
            await this.conversas.encerrar(
              c.id,
              tenant.id,
              null,
              'Conversa encerrada por inatividade.',
            );
          } catch (err) {
            this.log.warn(
              `Inatividade: erro ao encerrar conversa ${c.id}: ${(err as Error).message}`,
            );
          }
        }
      } catch (err) {
        this.log.warn(
          `Inatividade: erro ao processar tenant ${tenant.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Dead-letter: falhas que esgotaram as tentativas vão para audit_log. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const tenantId = job.data?.tenantId as string | undefined;
    if (!tenantId) return;
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao: 'ATENDIMENTO_JOB_FALHOU',
            entidade: 'queue',
            entidadeId: job.id ?? null,
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
      // best-effort
    }
  }
}
