import { OnWorkerEvent, Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  QUEUE_BUSCA,
  JOB_BUSCA_SYNC_ITEM,
  JOB_BUSCA_REINDEX_TENANT,
  JOB_BUSCA_CLEANUP_ORPHANS,
} from '../queue/queue.constants';
import {
  BuscaSyncService,
  SyncItemPayload,
  ReindexTenantPayload,
  CleanupOrphansPayload,
} from './busca-sync.service';
import { TipoBusca } from './busca.dto';

/**
 * Worker da fila `busca` — indexação/remoção de itens no `search_index`.
 *
 * Todos os jobs abrem TenantContext.run() para que o PrismaService sete o GUC
 * `app.current_tenant_id` e o RLS isole os dados por tenant (padrão da plataforma).
 *
 * Dead-letter: falhas persistentes são registradas em `audit_log` via
 * @OnWorkerEvent('failed'), igual ao DocumentosFtsWorker.
 *
 * Cron de cleanup: JOB_BUSCA_CLEANUP_ORPHANS é enfileirado como job repetido
 * a cada 10 minutos na inicialização do módulo (via onModuleInit).
 */
@Processor(QUEUE_BUSCA, { concurrency: 3 })
export class BuscaSyncWorker extends WorkerHost implements OnModuleInit {
  private readonly log = new Logger(BuscaSyncWorker.name);

  constructor(
    private readonly sync: BuscaSyncService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_BUSCA) private readonly fila: Queue,
  ) {
    super();
  }

  /**
   * Agenda o cron de cleanup (a cada 10 min). O job repetido por tenant é inviável
   * sem listar tenants — portanto enfileiramos um job especial "all" que o worker
   * converte em um cleanup por tenant ativo. O repeat é idempotente (mesmo jobId).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.fila.add(
        JOB_BUSCA_CLEANUP_ORPHANS,
        { tenantId: '__all__' },
        {
          repeat: { every: 10 * 60 * 1000 }, // 10 minutos
          jobId: 'busca-cleanup-cron',
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 100 },
        },
      );
      this.log.log('Cron de cleanup do search_index agendado (10min).');
    } catch (e) {
      this.log.warn(`Não foi possível agendar cron de cleanup: ${(e as Error).message}`);
    }
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_BUSCA_SYNC_ITEM) {
      return this.processarSyncItem(job as Job<SyncItemPayload>);
    }
    if (job.name === JOB_BUSCA_REINDEX_TENANT) {
      return this.processarReindex(job as Job<ReindexTenantPayload>);
    }
    if (job.name === JOB_BUSCA_CLEANUP_ORPHANS) {
      return this.processarCleanup(job as Job<CleanupOrphansPayload>);
    }
  }

  private async processarSyncItem(job: Job<SyncItemPayload>): Promise<void> {
    const { tenantId, tipo, refId } = job.data;
    if (!tenantId || !tipo || !refId) return;

    await TenantContext.run({ tenantId }, () => this.sync.processarItem(tipo as TipoBusca, refId));

    this.log.debug(`sync-item ok: ${tipo}/${refId} (tenant ${tenantId})`);
  }

  private async processarReindex(job: Job<ReindexTenantPayload>): Promise<void> {
    const { tenantId } = job.data;
    if (!tenantId) return;

    const total = await TenantContext.run({ tenantId }, () => this.sync.reindexarTodas());

    this.log.log(`reindex concluído (tenant ${tenantId}): ${total} itens indexados`);
  }

  private async processarCleanup(job: Job<CleanupOrphansPayload>): Promise<void> {
    const { tenantId } = job.data;

    // Job especial '__all__' percorre todos os tenants ativos
    if (tenantId === '__all__') {
      const tenants = await this.prisma.platform().tenant.findMany({
        where: { ativo: true },
        select: { id: true },
      });
      for (const t of tenants) {
        try {
          const removidos = await TenantContext.run({ tenantId: t.id }, () =>
            this.sync.cleanupOrphansLocal(),
          );
          if (removidos > 0) {
            this.log.log(`cleanup (tenant ${t.id}): ${removidos} órfãos removidos`);
          }
        } catch (e) {
          this.log.warn(`cleanup falhou (tenant ${t.id}): ${(e as Error).message}`);
        }
      }
      return;
    }

    if (!tenantId) return;
    const removidos = await TenantContext.run({ tenantId }, () =>
      this.sync.cleanupOrphansLocal(),
    );
    this.log.log(`cleanup (tenant ${tenantId}): ${removidos} órfãos removidos`);
  }

  /** Dead-letter: falhas persistentes vão para audit_log (Regra 6 do CLAUDE.md). */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    this.log.warn(`Job ${job.name} falhou (${JSON.stringify(job.data)}): ${error.message}`);

    try {
      const tenantId = (job.data as { tenantId?: string }).tenantId;
      // Não registra o job '__all__' (não é de tenant específico)
      if (tenantId && tenantId !== '__all__') {
        await TenantContext.run({ tenantId }, () =>
          this.prisma.db.auditLog.create({
            data: {
              tenantId,
              atorId: null,
              acao: 'WORKER_FALHOU',
              entidade: 'busca_worker',
              entidadeId: null,
              dados: {
                jobName: job.name,
                jobId: job.id,
                erro: error.message,
                tentativas: job.attemptsMade,
                payload: job.data,
              } as object,
            },
          }),
        );
      }
    } catch {
      // Nunca deixar falha de auditoria derrubar o handler
    }
  }
}
