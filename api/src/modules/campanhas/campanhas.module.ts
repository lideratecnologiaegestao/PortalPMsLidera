import { Module } from '@nestjs/common';
import { CampanhasController } from './campanhas.controller';
import { CampanhasAdminController } from './campanhas-admin.controller';
import { CampanhasService } from './campanhas.service';

/**
 * Módulo de Campanhas Institucionais.
 *
 * Fase 1: motor de janela de datas + resolver Redis + CRUD admin + biblioteca.
 * Fase 2 (futuro): scheduler BullMQ + recorrência autônoma + broadcast.
 */
@Module({
  controllers: [CampanhasController, CampanhasAdminController],
  providers: [CampanhasService],
  exports: [CampanhasService],
})
export class CampanhasModule {}
