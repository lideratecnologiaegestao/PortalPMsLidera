import {
  Controller,
  Get,
  Header,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { register } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';
import { redisConnection } from '../queue/redis.config';

/**
 * Health checks e métricas. Estas rotas NÃO têm tenant (são chamadas por
 * probes do k8s / scrape do Prometheus) — o TenantMiddleware as ignora.
 *   - /api/health        liveness (o processo está de pé)
 *   - /api/health/ready  readiness (DB e Redis respondem)
 *   - /api/metrics       métricas Prometheus
 */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('health/ready')
  async ready() {
    const checks = { db: false, redis: false };
    try {
      await this.prisma.platform().$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      /* db indisponível */
    }
    try {
      checks.redis = (await redisConnection.ping()) === 'PONG';
    } catch {
      /* redis indisponível */
    }
    if (!checks.db || !checks.redis) {
      throw new ServiceUnavailableException({ status: 'unavailable', ...checks });
    }
    return { status: 'ready', ...checks };
  }

  @Get('metrics')
  @Header('Content-Type', register.contentType)
  metrics(@Req() req: Request) {
    // se METRICS_TOKEN estiver definido, exige Bearer (as métricas têm tenant_id
    // em labels). Sem o env, fica aberto (dev) — em prod, defina o token e/ou
    // restrinja por IP no Nginx/Cloudflare.
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException();
    }
    return register.metrics();
  }
}
