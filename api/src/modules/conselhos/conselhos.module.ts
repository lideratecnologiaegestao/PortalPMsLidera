import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { ConselhosController } from './conselhos.controller';
import { ConselhosAdminController } from './conselhos-admin.controller';
import { ConselhosService } from './conselhos.service';
import { BuscaModule } from '../busca/busca.module';

/** Cadastro de Conselhos Municipais (Fase 3 do Cadastro de Documentos). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [ConselhosController, ConselhosAdminController],
  providers: [ConselhosService],
  exports: [ConselhosService],
})
export class ConselhosModule {}
