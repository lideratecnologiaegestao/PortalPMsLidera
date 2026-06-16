import { Module } from '@nestjs/common';
import { collectDefaultMetrics } from 'prom-client';
import { HealthController } from './health.controller';

// métricas padrão do processo (CPU, memória, event loop) para o Prometheus
collectDefaultMetrics({ prefix: 'portal_api_' });

/** Observabilidade: liveness/readiness + métricas Prometheus. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
