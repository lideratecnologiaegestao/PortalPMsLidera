import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';

/**
 * Módulo de WhatsApp multi-provider (Z-API / Evolution / Meta Cloud stub).
 *
 * Exporta:
 *  - WhatsappService  → adapter público (enviar, enviarMidia, enviarBotoes)
 *  - WhatsappConfigService → leitura/gravação de config por tenant
 *
 * Importado por NotificacoesModule, AtendimentoModule e AuthModule.
 *
 * O webhook de ENTRADA (/webhooks/zapi/*) é um concern de Atendimento e é
 * registrado no AtendimentoModule (que importa este módulo p/ config/providers).
 * Assim a dependência é unidirecional (Atendimento → Whatsapp), sem ciclo.
 */
@Module({
  imports: [HttpModule],
  controllers: [WhatsappAdminController],
  providers: [WhatsappConfigService, WhatsappService],
  exports: [WhatsappService, WhatsappConfigService],
})
export class WhatsappModule {}
