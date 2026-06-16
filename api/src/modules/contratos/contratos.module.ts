import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { ContratosController } from './contratos.controller';
import { ContratosAdminController } from './contratos-admin.controller';
import { ContratosService } from './contratos.service';
import { BuscaModule } from '../busca/busca.module';

/** Cadastro de Contratos e Aditivos (dimensão PNTP). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [ContratosController, ContratosAdminController],
  providers: [ContratosService],
  exports: [ContratosService],
})
export class ContratosModule {}
