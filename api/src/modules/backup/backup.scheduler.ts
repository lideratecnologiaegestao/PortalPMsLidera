import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_BACKUP_TICK, QUEUE_BACKUP } from '../queue/queue.constants';

/**
 * Agenda um "tique" de hora em hora. O worker decide, a cada tique, se está na
 * hora de rodar o backup conforme a FREQUÊNCIA configurada no painel — assim a
 * periodicidade é mudada pelo painel sem reconfigurar a fila.
 */
@Injectable()
export class BackupScheduler implements OnModuleInit {
  private readonly log = new Logger(BackupScheduler.name);

  constructor(@InjectQueue(QUEUE_BACKUP) private readonly fila: Queue) {}

  async onModuleInit() {
    try {
      await this.fila.add(
        JOB_BACKUP_TICK, {},
        { repeat: { every: 3_600_000 }, removeOnComplete: true, removeOnFail: true },
      );
    } catch (e) {
      this.log.warn(`Não foi possível agendar o tique de backup: ${String(e)}`);
    }
  }
}
