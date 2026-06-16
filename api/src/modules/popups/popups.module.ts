import { Module } from '@nestjs/common';
import { PopupsController, PopupsAdminController } from './popups.controller';
import { PopupsService } from './popups.service';

/** Popups do portal (imagem/vídeo/YouTube/HTML, por página, com datas). */
@Module({
  controllers: [PopupsController, PopupsAdminController],
  providers: [PopupsService],
  exports: [PopupsService],
})
export class PopupsModule {}
