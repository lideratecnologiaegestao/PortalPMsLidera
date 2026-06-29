import { Module } from '@nestjs/common';
import { PoliticasController, PoliticasAdminController } from './politicas.controller';
import { PoliticasService } from './politicas.service';

/** Documentos legais versionados: Acessibilidade, Privacidade (LGPD), Cookies. */
@Module({
  controllers: [PoliticasController, PoliticasAdminController],
  providers: [PoliticasService],
  exports: [PoliticasService],
})
export class PoliticasModule {}
