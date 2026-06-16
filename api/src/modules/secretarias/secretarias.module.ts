import { Module } from '@nestjs/common';
import { SecretariasController, SecretariasAdminController } from './secretarias.controller';
import { SecretariasService } from './secretarias.service';
import { MenusModule } from '../menus/menus.module';
import { BuscaModule } from '../busca/busca.module';

/** Secretarias municipais. Leitura pública; gestão via admin (RBAC+RLS). */
@Module({
  imports: [MenusModule, BuscaModule],
  controllers: [SecretariasController, SecretariasAdminController],
  providers: [SecretariasService],
  exports: [SecretariasService],
})
export class SecretariasModule {}
