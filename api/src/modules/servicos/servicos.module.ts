import { Module } from '@nestjs/common';
import { ServicosController, ServicosAdminController } from './servicos.controller';
import { ServicosService } from './servicos.service';
import { BuscaModule } from '../busca/busca.module';

/** Catálogo de serviços municipais. Leitura pública; gestão via admin (RBAC+RLS). */
@Module({
  imports: [BuscaModule],
  controllers: [ServicosController, ServicosAdminController],
  providers: [ServicosService],
  exports: [ServicosService],
})
export class ServicosModule {}
