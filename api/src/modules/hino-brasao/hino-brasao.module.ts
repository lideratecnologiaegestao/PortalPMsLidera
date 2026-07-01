import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { BuscaModule } from '../busca/busca.module';
import { HinoBrasaoController, HinoBrasaoAdminController } from './hino-brasao.controller';
import { HinoBrasaoService } from './hino-brasao.service';

/** Hino e Brasão — página institucional singleton (letra + mídia + brasões). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [HinoBrasaoController, HinoBrasaoAdminController],
  providers: [HinoBrasaoService],
  exports: [HinoBrasaoService],
})
export class HinoBrasaoModule {}
