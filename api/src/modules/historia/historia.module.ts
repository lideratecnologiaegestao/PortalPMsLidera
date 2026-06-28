import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { HistoriaController, HistoriaAdminController } from './historia.controller';
import { HistoriaService } from './historia.service';

/** História do Município — página institucional singleton (texto rico HTML/MD). */
@Module({
  imports: [MenusModule],
  controllers: [HistoriaController, HistoriaAdminController],
  providers: [HistoriaService],
  exports: [HistoriaService],
})
export class HistoriaModule {}
