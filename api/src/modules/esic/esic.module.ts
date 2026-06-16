import { Module } from '@nestjs/common';
import { EsicController } from './esic.controller';
import { EsicService } from './esic.service';

@Module({
  controllers: [EsicController],
  providers: [EsicService],
  exports: [EsicService],
})
export class EsicModule {}
