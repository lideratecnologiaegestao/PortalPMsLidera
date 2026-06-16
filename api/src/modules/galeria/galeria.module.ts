import { Module } from '@nestjs/common';
import { GaleriaController, GaleriaAdminController } from './galeria.controller';
import { GaleriaService } from './galeria.service';

/** Galeria de fotos e vídeos compartilhada do tenant. Pública + admin (RBAC+RLS). */
@Module({
  controllers: [GaleriaController, GaleriaAdminController],
  providers: [GaleriaService],
  exports: [GaleriaService],
})
export class GaleriaModule {}
