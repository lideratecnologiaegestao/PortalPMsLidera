import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_ELEVATION } from '../queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { ElevationRequestsService } from './elevation-requests.service';
import { ElevationRequestsAuthController } from './elevation-requests-auth.controller';
import { ElevationRequestsAdminController } from './elevation-requests-admin.controller';
import { ElevationRequestsPlatformController } from './elevation-requests-platform.controller';
import { ElevationExpireWorker } from './workers/elevation-expire.worker';
import { ElevationExpireScheduler } from './elevation-expire.scheduler';

/**
 * Módulo de Solicitações de Elevação de Papel (ADR-0005 Fase 2).
 *
 * Controllers:
 *  - ElevationRequestsAuthController  → /api/auth/* (cidadão/usuário logado)
 *  - ElevationRequestsAdminController → /api/admin/elevation-requests (admin_prefeitura/gestor)
 *  - ElevationRequestsPlatformController → /api/_platform/elevation-requests (super_admin)
 *
 * Worker:
 *  - ElevationExpireWorker + ElevationExpireScheduler: expiração diária cross-tenant
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ELEVATION }),
    AuthModule, // para injetar CidadaoAuthService no ElevationRequestsAuthController
  ],
  controllers: [
    ElevationRequestsAuthController,
    ElevationRequestsAdminController,
    ElevationRequestsPlatformController,
  ],
  providers: [
    ElevationRequestsService,
    ElevationExpireWorker,
    ElevationExpireScheduler,
  ],
  exports: [ElevationRequestsService],
})
export class ElevationRequestsModule {}
