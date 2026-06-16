import { Module } from '@nestjs/common';
import { NoticiasController, NoticiasAdminController } from './noticias.controller';
import { NoticiasService } from './noticias.service';
import { BuscaModule } from '../busca/busca.module';

/** Notícias/imprensa da home. Leitura pública; gestão via admin (RBAC+RLS). */
@Module({
  imports: [BuscaModule],
  controllers: [NoticiasController, NoticiasAdminController],
  providers: [NoticiasService],
  exports: [NoticiasService],
})
export class NoticiasModule {}
