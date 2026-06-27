import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_ATENDIMENTO } from '../queue/queue.constants';
import { IaModule } from '../ia/ia.module';
import { ManifestacoesModule } from '../manifestacoes/manifestacoes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AtendimentoGateway } from './atendimento.gateway';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { AtendimentoBotService } from './atendimento-bot.service';
import { AtendimentoConfigService } from './atendimento-config.service';
import { AtendimentoWorker } from './atendimento.worker';
import { AtendimentoWhatsappAgenteService } from './atendimento-whatsapp-agente.service';
import { ExpedienteService } from './expediente.service';
import { AtendimentoController } from './atendimento.controller';
import { AtendimentoAdminController } from './atendimento-admin.controller';
import { WebhookEvolutionController } from './webhook-evolution.controller';
import { WhatsappWebhookController } from '../whatsapp/whatsapp-webhook.controller';
import { WhatsappMetaWebhookController } from '../whatsapp/whatsapp-meta-webhook.controller';
import { WhatsappMetaCanalWebhookController } from '../whatsapp/whatsapp-meta-canal-webhook.controller';
import { TelegramWebhookController } from '../whatsapp/telegram-webhook.controller';

/**
 * Módulo de Atendimento Omnichannel (chatbot + atendimento humano).
 * Widget 24h + bot IA + console admin. Canais: widget e WhatsApp.
 * F1: widget + bot + expediente + inbox admin + worker + inatividade.
 * F2: transferência, tags, notas internas, transcrição, config.
 * F3: webhook WhatsApp (Evolution → adapter WhatsappModule).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_ATENDIMENTO,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1000 },
      },
    }),
    HttpModule,           // HttpService (TelegramWebhookController → answerCallback)
    IaModule,             // IaService.chatMultiturno
    ManifestacoesModule,  // TramitacaoService
    NotificacoesModule,   // NotificacoesService (aviso WhatsApp+e-mail ao escalar)
    WhatsappModule,       // adapter (envio) + WhatsappConfigService (webhook de entrada)
  ],
  controllers: [
    AtendimentoController,
    AtendimentoAdminController,
    WebhookEvolutionController,
    WhatsappWebhookController, // webhook de entrada Z-API (concern de atendimento)
    WhatsappMetaWebhookController, // webhook de entrada Meta Cloud (config única, slug-based)
    WhatsappMetaCanalWebhookController, // webhook de entrada Meta Cloud (multi-canal, /c/:secret)
    TelegramWebhookController,           // webhook de entrada Telegram Bot API (/webhooks/telegram/:secret)
  ],
  providers: [
    AtendimentoGateway,
    AtendimentoConversaService,
    AtendimentoBotService,
    AtendimentoConfigService,
    AtendimentoWorker,
    AtendimentoWhatsappAgenteService,
    ExpedienteService,
  ],
  exports: [AtendimentoConversaService, AtendimentoGateway],
})
export class AtendimentoModule implements OnModuleInit {
  constructor(
    private readonly conversaService: AtendimentoConversaService,
    private readonly gateway: AtendimentoGateway,
  ) {}

  /**
   * Injeta o gateway no service de conversas após a inicialização do módulo,
   * para que o service possa emitir eventos sem dependência circular.
   */
  onModuleInit() {
    this.conversaService.setGateway(this.gateway);
  }
}
