import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_INTEGRACOES } from '../queue/queue.constants';
import { DiarioController } from './diario.controller';
import { DiarioAdminController } from './diario-admin.controller';
import { DiarioPdfController } from './diario-pdf.controller';
import { DiarioConfigController } from './diario-config.controller';
import { HinosEstaduaisController } from './hinos-estaduais.controller';
import { DiarioService } from './diario.service';
import { DiarioConfigService } from './diario-config.service';
import { HinosEstaduaisService } from './hinos-estaduais.service';
import { SignatureService } from './signature.service';
import { DiarioPdfService } from './diario-pdf.service';
import { DiarioAlertasService } from './diario-alertas.service';
import { DiarioWorker } from './diario.worker';
import { StorageService } from '../storage/storage.service';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ThemeModule } from '../theme/theme.module';
import { BuscaModule } from '../busca/busca.module';
import { CertificadoDigitalModule } from '../certificado-digital/certificado-digital.module';

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
    CertificadoDigitalModule, // certificado digital do órgão p/ assinar a edição
  ],
  controllers: [DiarioController, DiarioAdminController, DiarioPdfController, DiarioConfigController, HinosEstaduaisController],
  providers: [
    DiarioService,
    DiarioConfigService,
    HinosEstaduaisService,
    SignatureService,
    DiarioPdfService,
    DiarioAlertasService,
    DiarioWorker,
    StorageService,
  ],
  exports: [DiarioService],
})
export class DiarioModule {}
