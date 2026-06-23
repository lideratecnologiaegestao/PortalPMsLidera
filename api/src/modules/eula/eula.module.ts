import { Global, Module } from '@nestjs/common';
import { EulaController } from './eula.controller';
import { EulaService } from './eula.service';

/**
 * Módulo EULA / Termo de Sigilo da Ouvidoria — ADR-0005 Fase 3.
 *
 * @Global — o EulaService é exportado globalmente para que o EulaGuard
 * (aplicado nos controllers de ouvidoria/e-SIC) possa injetá-lo sem
 * precisar importar EulaModule em cada módulo consumidor.
 */
@Global()
@Module({
  controllers: [EulaController],
  providers: [EulaService],
  exports: [EulaService],
})
export class EulaModule {}
