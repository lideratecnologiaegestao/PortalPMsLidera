import { Module } from '@nestjs/common';
import { BannersController, BannersAdminController } from './banners.controller';
import { BannersService } from './banners.service';

/** Banners/carrossel da home. Leitura pública; gestão via admin (RBAC+RLS). */
@Module({
  controllers: [BannersController, BannersAdminController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
