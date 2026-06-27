import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICACOES } from '../queue/queue.constants';
import { EmailService } from './email.service';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { NotificacoesService } from './notificacoes.service';
import { NotificacoesWorker } from './notificacoes.worker';
import { ContatosService } from './contatos.service';
import { ContatosController } from './contatos.controller';
import { TenantEmailConfigService } from './tenant-email-config.service';
import { TenantEmailConfigController } from './tenant-email-config.controller';
import { PushService } from './push.service';
import { PushTokenController } from './push-token.controller';
import { NotificacoesUsuarioService } from './notificacoes-usuario.service';
import { NotificacoesUsuarioController } from './notificacoes-usuario.controller';
import { StorageService } from '../storage/storage.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

/**
 * Notificações multicanal (WhatsApp via adapter + e-mail + push) + cadastro e
 * verificação de contatos. A fila `notificacoes` é processada pelo worker aqui;
 * o NotificacoesService é exportado para os demais módulos enfileirarem eventos.
 *
 * WhatsApp agora vem do WhatsappModule (adapter multi-provider Z-API/Evolution).
 * WhatsappService é re-exportado para retrocompatibilidade dos callers.
 */
@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: QUEUE_NOTIFICACOES }),
    WhatsappModule,
    PlatformSettingsModule,
  ],
  controllers: [ContatosController, TenantEmailConfigController, PushTokenController, NotificacoesUsuarioController],
  providers: [
    EmailService,
    PushService,
    NotificacoesService,
    ContatosService,
    TenantEmailConfigService,
    NotificacoesUsuarioService,
    NotificacoesWorker,
    StorageService,
  ],
  // WhatsappModule é re-exportado (inclui WhatsappService e WhatsappConfigService)
  exports: [NotificacoesService, EmailService, WhatsappModule, ContatosService],
})
export class NotificacoesModule {}
