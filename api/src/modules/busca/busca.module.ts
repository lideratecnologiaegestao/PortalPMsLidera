import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_BUSCA } from '../queue/queue.constants';
import { IaModule } from '../ia/ia.module';
import { BuscaController } from './busca.controller';
import { BuscaService } from './busca.service';
import { BuscaSyncService } from './busca-sync.service';
import { BuscaSyncWorker } from './busca-sync.worker';

/**
 * BuscaModule — buscador unificado (ADR-0004).
 *
 * Importa IaModule para usar EmbeddingsService (leg semântica vetorial)
 * e RerankService (RERANK Voyage AI) na busca híbrida.
 *
 * Exporta `BuscaSyncService` para que os outros modules o injetem e
 * enfileirem itens após writes (fire-and-forget).
 *
 * Registra a fila QUEUE_BUSCA localmente (além do registro global no
 * QueueModule) para que o Worker e o InjectQueue funcionem corretamente.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_BUSCA }),
    IaModule,
  ],
  controllers: [BuscaController],
  providers: [BuscaService, BuscaSyncService, BuscaSyncWorker],
  exports: [BuscaSyncService],
})
export class BuscaModule {}
