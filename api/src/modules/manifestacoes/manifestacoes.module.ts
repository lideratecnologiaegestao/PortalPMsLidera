import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICACOES, QUEUE_SLA } from '../queue/queue.constants';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MediaModule } from '../media/media.module';
import { AnexosService } from './anexos.service';
import { ManifestacoesController } from './manifestacoes.controller';
import { ManifestacoesService } from './manifestacoes.service';
import { ManifestacoesAdminController } from './manifestacoes-admin.controller';
import { ManifestacoesAdminService } from './manifestacoes-admin.service';
import { TramitacaoService } from './tramitacao.service';
import { SlaWorker } from './workers/sla.worker';
import { SlaScheduler } from './sla-scheduler';
import { ThemeModule } from '../theme/theme.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_SLA }, { name: QUEUE_NOTIFICACOES }),
    NotificacoesModule,
    MediaModule,
    ThemeModule, // ThemeService para logo nos relatórios PDF
  ],
  controllers: [ManifestacoesController, ManifestacoesAdminController],
  providers: [ManifestacoesService, ManifestacoesAdminService, TramitacaoService, AnexosService, SlaWorker, SlaScheduler],
  exports: [ManifestacoesService, ManifestacoesAdminService, TramitacaoService],
})
export class ManifestacoesModule {}
