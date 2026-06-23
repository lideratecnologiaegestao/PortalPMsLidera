import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_ELEVATION_EXPIRE, QUEUE_ELEVATION } from '../queue/queue.constants';

/**
 * Agenda a expiração diária das solicitações de elevação pendentes.
 *
 * Padrão idêntico ao SlaScheduler: repeatable 1x/dia + execução imediata
 * no boot para popular o estado sem esperar 24h.
 */
@Injectable()
export class ElevationExpireScheduler implements OnModuleInit {
  private readonly logger = new Logger(ElevationExpireScheduler.name);

  constructor(@InjectQueue(QUEUE_ELEVATION) private readonly fila: Queue) {}

  async onModuleInit() {
    try {
      // Repeatable diário (idempotente pela repeat key do BullMQ)
      await this.fila.add(
        JOB_ELEVATION_EXPIRE,
        {},
        {
          repeat: { every: 24 * 60 * 60 * 1000 }, // 1x por dia
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      // Execução imediata no boot (jobId fixo = idempotente)
      await this.fila.add(
        JOB_ELEVATION_EXPIRE,
        {},
        { jobId: 'elevation-expire-boot', removeOnComplete: true },
      );
    } catch (e) {
      this.logger.warn(`Não foi possível agendar expiração de elevation_requests: ${String(e)}`);
    }
  }
}
