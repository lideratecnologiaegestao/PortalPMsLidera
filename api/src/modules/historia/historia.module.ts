import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { BuscaModule } from '../busca/busca.module';
import { HistoriaController, HistoriaAdminController } from './historia.controller';
import { HistoriaService } from './historia.service';

/** História do Município — página institucional singleton (texto rico HTML/MD). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [HistoriaController, HistoriaAdminController],
  providers: [HistoriaService],
  exports: [HistoriaService],
})
export class HistoriaModule {}
