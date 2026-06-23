import { Module } from '@nestjs/common';
import { NoticiasController, NoticiasAdminController } from './noticias.controller';
import { NoticiasService } from './noticias.service';
import { ComentariosController, ComentariosAdminController } from './comentarios.controller';
import { ComentariosService } from './comentarios.service';
import { ComentarioModeradorService } from './comentario-moderador.service';
import { BuscaModule } from '../busca/busca.module';
import { IaModule } from '../ia/ia.module';

/** Notícias/imprensa da home. Leitura pública; gestão via admin (RBAC+RLS). */
@Module({
  imports: [
    BuscaModule,
    IaModule, // AnthropicService para moderação automática da Camada 2
  ],
  controllers: [
    NoticiasController,
    NoticiasAdminController,
    ComentariosController,
    ComentariosAdminController,
  ],
  providers: [NoticiasService, ComentariosService, ComentarioModeradorService],
  exports: [NoticiasService],
})
export class NoticiasModule {}
