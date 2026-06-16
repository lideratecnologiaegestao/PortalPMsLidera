import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_BACKUP_RUN, QUEUE_BACKUP } from '../queue/queue.constants';
import { BackupService, BackupConfig } from './backup.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * Worker da fila de backup. Trata:
 *  - JOB_BACKUP_RUN  → execução manual (botão no painel).
 *  - tique horário   → executa só se a frequência configurada disser que é a hora.
 * 1 worker por fila (convenção).
 */
@Processor(QUEUE_BACKUP, { concurrency: 1 })
export class BackupWorker extends WorkerHost {
  private readonly log = new Logger(BackupWorker.name);

  constructor(
    private readonly backup: BackupService,
    private readonly settings: PlatformSettingsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB_BACKUP_RUN) {
      const tenantId = (job.data as { tenantId?: string })?.tenantId;
      if (tenantId) await this.backup.executarEntidade(tenantId);
      else await this.backup.executar(true);
      return;
    }
    // tique horário
    const cfg = ((await this.settings.get()).backup as BackupConfig) ?? {};
    if (this.backup.disponivel && this.backup.estaNaHora(cfg)) {
      this.log.log('Backup agendado: está na hora — executando.');
      await this.backup.executar(false);
    }
  }
}
