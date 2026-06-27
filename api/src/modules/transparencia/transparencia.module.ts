import { Module } from '@nestjs/common';
import { TransparenciaController } from './transparencia.controller';
import { TransparenciaService } from './transparencia.service';
import { TransparenciaWorker } from './transparencia.worker';
import { DatasetsController } from './datasets.controller';
import { DatasetsService } from './datasets.service';
import { TransparenciaAdminController } from './transparencia-admin.controller';
import { TransparenciaAdminService } from './transparencia-admin.service';
import { StorageService } from '../storage/storage.service';

/**
 * Transparência ativa (LC 131/LRF) + dados abertos. Leitura pública isolada
 * por RLS; ingestão via fila `integracoes` (ETL do n8n). Os datasets PNTP
 * (diárias, obras, dívida ativa, terceirizados, convênios, licitações,
 * contratos, documentos) são servidos genericamente por DatasetsController.
 * Admin: sync-log e gestão de documentos (RBAC: ADMIN_PREFEITURA/GESTOR).
 */
@Module({
  controllers: [TransparenciaController, DatasetsController, TransparenciaAdminController],
  providers: [TransparenciaService, TransparenciaWorker, DatasetsService, TransparenciaAdminService, StorageService],
  exports: [TransparenciaService, DatasetsService, TransparenciaAdminService],
})
export class TransparenciaModule {}
