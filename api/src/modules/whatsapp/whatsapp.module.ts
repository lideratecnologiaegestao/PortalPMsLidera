import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappCanaisService } from './whatsapp-canais.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappConsumoService } from './whatsapp-consumo.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';

/**
 * Módulo de WhatsApp / Instagram multi-provider (Z-API / Evolution / Meta Cloud / Instagram Direct).
 *
 * Exporta:
 *  - WhatsappService        → adapter público (enviar, enviarPorCanal, etc.)
 *  - WhatsappConfigService  → leitura/gravação de config única por tenant
 *  - WhatsappCanaisService  → CRUD de canais multi-número Meta/Instagram (migrations 081/082)
 *  - WhatsappConsumoService → resumo de consumo de templates + cota (migration 082)
 *
 * Importado por NotificacoesModule, AtendimentoModule e AuthModule.
 *
 * Os webhooks de ENTRADA são registrados no AtendimentoModule:
 *   - /webhooks/zapi/*          → WhatsappWebhookController
 *   - /webhooks/meta/{slug}/*   → WhatsappMetaWebhookController  (config única)
 *   - /webhooks/meta-canal/:secret → WhatsappMetaCanalWebhookController (multi-canal, WA + IG)
 * Assim a dependência é unidirecional (Atendimento → Whatsapp), sem ciclo.
 */
@Module({
  imports: [HttpModule],
  controllers: [WhatsappAdminController],
  providers: [WhatsappConfigService, WhatsappCanaisService, WhatsappService, WhatsappConsumoService],
  exports: [WhatsappService, WhatsappConfigService, WhatsappCanaisService, WhatsappConsumoService],
})
export class WhatsappModule {}
