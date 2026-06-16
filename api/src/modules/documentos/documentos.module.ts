import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MenusModule } from '../menus/menus.module';
import { IaModule } from '../ia/ia.module';
import { QUEUE_IA } from '../queue/queue.constants';
import { DocumentosController } from './documentos.controller';
import { DocumentosAdminController } from './documentos-admin.controller';
import { DocumentosService } from './documentos.service';
import { DocumentosFtsWorker } from './documentos-fts.worker';
import { StorageService } from '../storage/storage.service';
import { BuscaModule } from '../busca/busca.module';

/**
 * Motor único de Cadastro de Documentos (Leis, Decretos…) com auto-menu + FTS.
 *
 * Importa IaModule para disponibilizar:
 *  - IaIndexadorService  → reindexação vetorial (Camada 4) após OCR
 *  - AnthropicService    → Claude visão (Camada 3 do pipeline OCR, só fallback)
 *
 * Importa BuscaModule para BuscaSyncService (sync do search_index unificado).
 *
 * Sentido de dependência: DocumentosModule → IaModule + BuscaModule (sem ciclo).
 */
@Module({
  imports: [MenusModule, BullModule.registerQueue({ name: QUEUE_IA }), IaModule, BuscaModule],
  controllers: [DocumentosController, DocumentosAdminController],
  providers: [DocumentosService, DocumentosFtsWorker, StorageService],
  exports: [DocumentosService],
})
export class DocumentosModule {}
