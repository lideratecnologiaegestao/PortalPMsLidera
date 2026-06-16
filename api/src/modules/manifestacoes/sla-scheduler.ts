import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_SLA_SCAN, QUEUE_SLA } from '../queue/queue.constants';

/**
 * Agenda a varredura de manifestações com prazo legal a vencer. Roda de hora
 * em hora (repeatable) e uma vez no boot. O processamento fica no SlaWorker,
 * que atualiza a métrica `portal_sla_at_risk` e registra na auditoria.
 */
@Injectable()
export class SlaScheduler implements OnModuleInit {
  private readonly logger = new Logger(SlaScheduler.name);

  constructor(@InjectQueue(QUEUE_SLA) private readonly fila: Queue) {}

  async onModuleInit() {
    try {
      // repeatable de hora em hora (idempotente pela repeat key)
      await this.fila.add(
        JOB_SLA_SCAN,
        {},
        { repeat: { every: 3_600_000 }, removeOnComplete: true, removeOnFail: true },
      );
      // uma varredura imediata para popular a métrica no startup
      await this.fila.add(JOB_SLA_SCAN, {}, { jobId: 'sla-scan-boot', removeOnComplete: true });
    } catch (e) {
      this.logger.warn(`Não foi possível agendar a varredura de SLA: ${String(e)}`);
    }
  }
}
