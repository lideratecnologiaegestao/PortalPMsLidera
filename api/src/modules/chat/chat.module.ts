import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaModule } from '../media/media.module';
import { IaModule } from '../ia/ia.module';
import { QUEUE_CHAT } from '../queue/queue.constants';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatBotService } from './chat-bot.service';
import { ChatBotWorker } from './chat-bot.worker';

/**
 * Chat interno (funcionários) + integração e-SIC + Assistente do Portal (bot IA).
 * REST (histórico/conversas/upload) + WebSocket Gateway (tempo real, /api/socket.io).
 * Mídia restrita reutiliza MediaStorageService.
 *
 * O Assistente do Portal replica o padrão do bot de atendimento:
 * - ChatBotService: get-or-create bot user, enfileiramento, processamento.
 * - ChatBotWorker: BullMQ, QUEUE_CHAT, chama IaService.chatMultiturno(interno=true).
 * - IaModule importado para acesso ao IaService (sem ciclo — IaModule não importa ChatModule).
 */
@Module({
  imports: [
    MediaModule,
    IaModule,
    BullModule.registerQueue({
      name: QUEUE_CHAT,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatBotService, ChatBotWorker],
  exports: [ChatService],
})
export class ChatModule {}
