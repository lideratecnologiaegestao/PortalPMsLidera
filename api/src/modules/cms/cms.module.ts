import { Module } from '@nestjs/common';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { MenusModule } from '../menus/menus.module';
import { BuscaModule } from '../busca/busca.module';

/** CMS dinâmico (páginas por blocos). Tema/WCAG fica no ThemeModule. */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
