import { Module } from '@nestjs/common';
import { AplicController } from './aplic.controller';
import { AplicPublicController } from './aplic-public.controller';
import { AplicIngestaoService } from './aplic-ingestao.service';
import { AplicConsultaService } from './aplic-consulta.service';
import { AplicConfigService } from './aplic-config.service';

/**
 * Módulo APLIC (TCE-MT) — importação da carga contábil e consulta.
 * Fase 1: ingestão CT. Fase 2: consultas precisas (AplicConsultaService),
 * usadas pelo assistente (tool use) e por endpoints/transparência.
 * PrismaService é global.
 */
@Module({
  controllers: [AplicController, AplicPublicController],
  providers: [AplicIngestaoService, AplicConsultaService, AplicConfigService],
  exports: [AplicIngestaoService, AplicConsultaService, AplicConfigService],
})
export class AplicModule {}
