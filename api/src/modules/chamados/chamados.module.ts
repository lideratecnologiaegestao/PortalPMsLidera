import { Module } from '@nestjs/common';
import { ChamadosController } from './chamados.controller';
import { ChamadosAdminController } from './chamados-admin.controller';
import { ChamadosService } from './chamados.service';
import { StorageService } from '../storage/storage.service';
import { AntivirusService } from '../storage/antivirus.service';

/** App do Cidadão: chamados georreferenciados (PostGIS) + storage de fotos. */
@Module({
  controllers: [ChamadosController, ChamadosAdminController],
  providers: [ChamadosService, StorageService, AntivirusService],
  exports: [ChamadosService],
})
export class ChamadosModule {}
