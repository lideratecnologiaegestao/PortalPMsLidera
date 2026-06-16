import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { ConcursosController } from './concursos.controller';
import { ConcursosAdminController } from './concursos-admin.controller';
import { ConcursosService } from './concursos.service';
import { BuscaModule } from '../busca/busca.module';

/** Cadastro de Concursos e Processos Seletivos (Fase 4 do Cadastro de Documentos). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [ConcursosController, ConcursosAdminController],
  providers: [ConcursosService],
  exports: [ConcursosService],
})
export class ConcursosModule {}
