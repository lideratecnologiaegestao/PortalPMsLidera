import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { redisConnection, bullPrefix } from './redis.config';
import {
  QUEUE_ATENDIMENTO,
  QUEUE_BUSCA,
  QUEUE_EXPURGO,
  QUEUE_IA,
  QUEUE_INTEGRACOES,
  QUEUE_NOTIFICACOES,
  QUEUE_SLA,
  QUEUE_TRANSPARENCIA,
} from './queue.constants';

const rapido = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
};
const pesado = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
};

@Global()
@Module({
  imports: [
    // prefix isola as chaves do portal das do Evolution no Redis compartilhado
    BullModule.forRoot({ connection: redisConnection, prefix: bullPrefix }),
    // filas dedicadas (ver ADR-0001): cada uma com no máx. um worker
    BullModule.registerQueue(
      { name: QUEUE_SLA, defaultJobOptions: rapido },
      { name: QUEUE_NOTIFICACOES, defaultJobOptions: rapido },
      { name: QUEUE_ATENDIMENTO, defaultJobOptions: rapido },
      { name: QUEUE_TRANSPARENCIA, defaultJobOptions: pesado },
      { name: QUEUE_IA, defaultJobOptions: pesado },
      { name: QUEUE_EXPURGO, defaultJobOptions: pesado },
      { name: QUEUE_INTEGRACOES, defaultJobOptions: pesado },
      { name: QUEUE_BUSCA, defaultJobOptions: pesado },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
