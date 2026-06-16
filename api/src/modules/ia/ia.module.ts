import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';
import { AnthropicService } from './anthropic.service';
import { AntivirusService } from '../storage/antivirus.service';
import { EmbeddingsService } from './embeddings.service';
import { IaConhecimentoService } from './ia-conhecimento.service';
import { IaConhecimentoController } from './ia-conhecimento.controller';
import { IaIndexadorService } from './ia-indexador.service';
import { IaAdminController } from './ia-admin.controller';
import { TenantIaConfigService } from './tenant-ia-config.service';
import { RerankService } from './rerank.service';
import { AplicModule } from '../aplic/aplic.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { QUEUE_IA } from '../queue/queue.constants';

/**
 * Camada de IA: triagem de manifestações, busca/RAG multi-fonte e chatbot (API Anthropic).
 * Camada 4: busca semântica via embeddings multi-provedor (Voyage / OpenAI) + pgvector.
 *
 * IaModule NÃO importa DocumentosModule — o worker de reindexação vive em
 * DocumentosModule que importa IaModule (sentido único, sem ciclo).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_IA }),
    AplicModule, // consultas fiscais precisas (tool use do assistente)
    PlatformSettingsModule, // IA global do painel (chaves/modelo) com fallback ao .env
  ],
  controllers: [IaController, IaConhecimentoController, IaAdminController],
  providers: [
    IaService,
    AnthropicService,
    AntivirusService,
    EmbeddingsService,
    IaConhecimentoService,
    IaIndexadorService,
    TenantIaConfigService,
    RerankService,
  ],
  exports: [IaService, IaConhecimentoService, IaIndexadorService, EmbeddingsService, TenantIaConfigService, AnthropicService, RerankService],
})
export class IaModule {}
