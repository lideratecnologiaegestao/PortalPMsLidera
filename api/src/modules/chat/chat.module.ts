import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

/**
 * Chat interno (funcionários) + integração e-SIC. REST (histórico/conversas/
 * upload) + WebSocket Gateway (tempo real, sob /api/socket.io). Mídia restrita
 * reutiliza o MediaStorageService.
 */
@Module({
  imports: [MediaModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
