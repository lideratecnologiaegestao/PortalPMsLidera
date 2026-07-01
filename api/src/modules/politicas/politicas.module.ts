import { Module } from '@nestjs/common';
import { BuscaModule } from '../busca/busca.module';
import { PoliticasController, PoliticasAdminController } from './politicas.controller';
import { PoliticasService } from './politicas.service';

/** Documentos legais versionados: Acessibilidade, Privacidade (LGPD), Cookies. */
@Module({
  imports: [BuscaModule],
  controllers: [PoliticasController, PoliticasAdminController],
  providers: [PoliticasService],
  exports: [PoliticasService],
})
export class PoliticasModule {}
