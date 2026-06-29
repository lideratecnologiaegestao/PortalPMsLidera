import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { BuscaModule } from '../busca/busca.module';
import { PrefeitoController, PrefeitoAdminController } from './prefeito.controller';
import { PrefeitoService } from './prefeito.service';

/** Cadastro do Prefeito(a), Vice e galeria de ex-prefeitos (página "A Prefeitura"). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [PrefeitoController, PrefeitoAdminController],
  providers: [PrefeitoService],
  exports: [PrefeitoService],
})
export class PrefeitoModule {}
