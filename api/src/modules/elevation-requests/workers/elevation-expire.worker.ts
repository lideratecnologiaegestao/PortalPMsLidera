import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_ELEVATION_EXPIRE } from '../../queue/queue.constants';
import { ElevationRequestsService } from '../elevation-requests.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContext } from '../../../common/tenant/tenant.context';

/**
 * Worker de expiração de solicitações de elevação pendentes.
 *
 * Roda 1x/dia (agendado pelo ElevationExpireScheduler).
 * Varre cross-tenant via prisma.platform() para marcar como 'expirada'
 * as solicitações pendentes com mais de 30 dias.
 *
 * Idempotente: re-executar não causa duplicatas (updateMany por status='pendente').
 * Dead-letter: falhas auditadas em audit_log via @OnWorkerEvent('failed').
 */
@Processor('elevation', { concurrency: 1 })
export class ElevationExpireWorker extends WorkerHost {
  private readonly logger = new Logger(ElevationExpireWorker.name);

  constructor(
    private readonly service: ElevationRequestsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_ELEVATION_EXPIRE) return;

    // Worker cross-tenant: abre contexto de plataforma para que o service
    // use prisma.platform() corretamente (RLS desabilitado na sessão).
    await TenantContext.run({ isPlatform: true }, async () => {
      const expirados = await this.service.expirarPendentes();
      this.logger.log({ type: 'elevation-expire', expirados });
    });
  }

  /** Dead-letter: falhas auditadas na audit_log (Regra Inviolável #6). */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    this.logger.error(`elevation-expire falhou: ${error.message}`);
    await TenantContext.run({ isPlatform: true }, () =>
      this.prisma.platform().auditLog.create({
        data: {
          tenantId: null,
          atorId: null,
          acao: 'ELEVATION_EXPIRE_FALHOU',
          entidade: 'queue',
          entidadeId: job.id ?? null,
          dados: { erro: error.message, jobName: job.name },
        },
      }),
    );
  }
}
