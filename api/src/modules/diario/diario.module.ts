import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_INTEGRACOES } from '../queue/queue.constants';
import { DiarioController } from './diario.controller';
import { DiarioAdminController } from './diario-admin.controller';
import { DiarioPdfController } from './diario-pdf.controller';
import { DiarioService } from './diario.service';
import { SignatureService } from './signature.service';
import { DiarioPdfService } from './diario-pdf.service';
import { DiarioAlertasService } from './diario-alertas.service';
import { DiarioWorker } from './diario.worker';
import { StorageService } from '../storage/storage.service';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ThemeModule } from '../theme/theme.module';
import { BuscaModule } from '../busca/busca.module';

/**
 * Diário Oficial: composição em matérias, assinatura/carimbo, verificação de
 * autenticidade, geração assíncrona do PDF, busca e monitoramento por termo.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_INTEGRACOES }),
    NotificacoesModule, // EmailService + WhatsappService p/ os alertas
    ThemeModule, // ThemeService para logo no cabeçalho do PDF
    BuscaModule, // indexação das matérias no buscador unificado
  ],
  controllers: [DiarioController, DiarioAdminController, DiarioPdfController],
  providers: [
    DiarioService,
    SignatureService,
    DiarioPdfService,
    DiarioAlertasService,
    DiarioWorker,
    StorageService,
  ],
  exports: [DiarioService],
})
export class DiarioModule {}
