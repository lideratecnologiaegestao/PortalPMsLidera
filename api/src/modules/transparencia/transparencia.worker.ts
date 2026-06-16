import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  JOB_TRANSPARENCIA_SYNC,
  QUEUE_TRANSPARENCIA,
} from '../queue/queue.constants';
import { TransparenciaService } from './transparencia.service';
import { TransparenciaSyncJob } from './transparencia.types';

/**
 * Worker do ETL de Transparência (fila `integracoes`). Faz o upsert idempotente
 * dentro do contexto de tenant (RLS). Só trata o job de transparência — outros
 * jobs da fila (Diário, IA) terão seus próprios workers.
 */
@Processor(QUEUE_TRANSPARENCIA, { concurrency: 2 })
export class TransparenciaWorker extends WorkerHost {
  private readonly logger = new Logger(TransparenciaWorker.name);

  constructor(
    private readonly service: TransparenciaService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<TransparenciaSyncJob>): Promise<void> {
    if (job.name !== JOB_TRANSPARENCIA_SYNC) return; // não é nosso

    const { tenantId, dataset, origem, registros } = job.data;
    await TenantContext.run({ tenantId }, async () => {
      const r = await this.service.ingerir(dataset, origem, registros);
      this.logger.log(
        `Transparência sync: ${r.registros} registros em "${dataset}" (tenant ${tenantId}).`,
      );
    });
  }

  /** Dead-letter: falha de ETL vai para a auditoria (CLAUDE.md regra 6). */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<TransparenciaSyncJob>, error: Error) {
    if (job.name !== JOB_TRANSPARENCIA_SYNC) return;
    await TenantContext.run(
      { tenantId: job.data?.tenantId, isPlatform: !job.data?.tenantId },
      () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId: job.data?.tenantId ?? null,
            acao: 'TRANSPARENCIA_SYNC_FALHOU',
            entidade: 'queue',
            entidadeId: job.id ?? null,
            dados: { erro: error.message, dataset: job.data?.dataset },
          } as any,
        }),
    );
  }
}
