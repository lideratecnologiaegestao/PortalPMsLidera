import { Module } from '@nestjs/common';
import { PntpModule } from '../pntp/pntp.module';
import { AplicController } from './aplic.controller';
import { AplicPublicController } from './aplic-public.controller';
import { AplicIngestaoService } from './aplic-ingestao.service';
import { AplicConsultaService } from './aplic-consulta.service';
import { AplicConfigService } from './aplic-config.service';
import { StorageService } from '../storage/storage.service';

/**
 * Módulo APLIC (TCE-MT) — importação da carga contábil e consulta.
 * Fase 1: ingestão CT. Fase 2: consultas precisas (AplicConsultaService),
 * usadas pelo assistente (tool use) e por endpoints/transparência.
 * PrismaService é global.
 */
@Module({
  imports: [PntpModule],
  controllers: [AplicController, AplicPublicController],
  providers: [AplicIngestaoService, AplicConsultaService, AplicConfigService, StorageService],
  exports: [AplicIngestaoService, AplicConsultaService, AplicConfigService],
})
export class AplicModule {}
