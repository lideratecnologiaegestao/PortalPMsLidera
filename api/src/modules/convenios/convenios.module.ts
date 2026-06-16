import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { ConveniosController } from './convenios.controller';
import { ConveniosAdminController } from './convenios-admin.controller';
import { ConveniosService } from './convenios.service';
import { BuscaModule } from '../busca/busca.module';

/** Cadastro de Convênios e Transferências (dimensão PNTP). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [ConveniosController, ConveniosAdminController],
  providers: [ConveniosService],
  exports: [ConveniosService],
})
export class ConveniosModule {}
