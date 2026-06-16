import { Module } from '@nestjs/common';
import { HomeController, HomeAdminController } from './home.controller';
import { HomeService } from './home.service';

/** Layout configurável da home (Acesso Rápido + slider) e atalhos. */
@Module({
  controllers: [HomeController, HomeAdminController],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
