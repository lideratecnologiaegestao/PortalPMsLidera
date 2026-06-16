import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { LicitacoesController } from './licitacoes.controller';
import { LicitacoesAdminController } from './licitacoes-admin.controller';
import { LicitacoesService } from './licitacoes.service';
import { BuscaModule } from '../busca/busca.module';

/** Cadastro de Licitações (Fase 2 do Cadastro de Documentos). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [LicitacoesController, LicitacoesAdminController],
  providers: [LicitacoesService],
  exports: [LicitacoesService],
})
export class LicitacoesModule {}
