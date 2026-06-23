import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigPublicController } from './app-config-public.controller';
import { AppConfigAdminController } from './app-config-admin.controller';
import { AppConfigBuildController } from './app-config-build.controller';
import { AppConfigService } from './app-config.service';
import { AppConfigBuildService } from './app-config-build.service';
import { AppConfigBuildWorker } from './app-config-build.worker';
import { StorageService } from '../storage/storage.service';
import { IaModule } from '../ia/ia.module';
import { QUEUE_APP_BUILD } from '../queue/queue.constants';

/**
 * Módulo de configuração white-label do App do Cidadão (ADR-0006).
 *
 * Fase 1 (config): AppConfigService + controllers público e admin.
 * Fase 2 (builds): AppConfigBuildService + AppConfigBuildWorker + controller de builds.
 *
 * Controllers:
 *  - AppConfigPublicController  → GET /api/app-config (público, sem auth)
 *  - AppConfigAdminController   → GET|PATCH /api/admin/app-config + uploads
 *                                 (RBAC: ADMIN_PREFEITURA | SUPER_ADMIN)
 *  - AppConfigBuildController   → POST|GET /api/admin/app-config/builds
 *                                 (RBAC: ADMIN_PREFEITURA | SUPER_ADMIN)
 *
 * O PrismaService é global (importado via PrismaModule no AppModule).
 * StorageService: fornecido localmente (igual ao PlatformSettingsModule).
 * AnthropicService: importado via IaModule (diagnóstico de falha de build).
 * QueueModule é global e já registra QUEUE_APP_BUILD; re-registramos aqui
 * para injetar o @InjectQueue no service (padrão dos outros módulos).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_APP_BUILD }),
    IaModule, // AnthropicService para diagnóstico de erros de build
  ],
  controllers: [
    AppConfigPublicController,
    AppConfigAdminController,
    AppConfigBuildController,
  ],
  providers: [
    AppConfigService,
    StorageService,
    AppConfigBuildService,
    AppConfigBuildWorker,
  ],
  exports: [AppConfigService, AppConfigBuildService],
})
export class AppConfigModule {}
