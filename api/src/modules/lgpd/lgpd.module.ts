import { Module } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdAdminController } from './lgpd-admin.controller';
import { MeusDadosService } from './meus-dados.service';
import { SolicitacoesService } from './solicitacoes.service';
import { IncidentesService } from './incidentes.service';
import { LgpdDashboardService } from './lgpd-dashboard.service';
import { LgpdDocService } from './doc/lgpd-doc.service';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

// TODO fase 2: cron de alerta de prazo (JOB_LGPD_SOLICITACAO_ALERTA, JOB_INCIDENTE_ALERTA)
// Enquanto não há worker, o campo "atrasada"/"comunicacaoAtrasada" é DERIVADO no read.

@Module({
  imports: [PlatformSettingsModule],
  controllers: [LgpdController, LgpdAdminController],
  providers: [MeusDadosService, SolicitacoesService, IncidentesService, LgpdDashboardService, LgpdDocService],
  exports: [SolicitacoesService, IncidentesService, LgpdDashboardService, LgpdDocService],
})
export class LgpdModule {}
