import { Module } from '@nestjs/common';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/** Painéis de parede (TV) — BI agregado do ouvidor e do prefeito. */
@Module({
  controllers: [PainelController],
  providers: [PainelService],
})
export class PainelModule {}
