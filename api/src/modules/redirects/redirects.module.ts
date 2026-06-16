import { Module } from '@nestjs/common';
import { RedirectsController, RedirectsAdminController } from './redirects.controller';
import { RedirectsService } from './redirects.service';

@Module({
  controllers: [RedirectsController, RedirectsAdminController],
  providers: [RedirectsService],
  exports: [RedirectsService],
})
export class RedirectsModule {}
