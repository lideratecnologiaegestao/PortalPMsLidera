import { Injectable, Logger, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { TenantContext } from './tenant.context';

const TTL_TENANT = 300; // segundos (ADR-0001)

/**
 * Resolve o tenant a partir do Host da requisição:
 *   cuiaba.mt.gov.br            → domínio próprio
 *   cuiaba.suaplataforma.com.br → subdomínio da plataforma
 *
 * Rotas de plataforma (/_platform/*) seguem sem tenant, em modo super_admin.
 * O resultado é guardado em AsyncLocalStorage para toda a cadeia da request.
 * A resolução Host→tenant é cacheada em Redis (compartilhado entre réplicas).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = (req.headers['x-forwarded-host'] as string) || req.hostname;
    const rota = req.originalUrl || req.url || req.path;
    const requestId = randomUUID();
    const inicio = Date.now();

    // log estruturado de toda requisição ao concluir (sem dado pessoal)
    let tid: string | null = null;
    res.on('finish', () =>
      this.logger.log({
        type: 'request',
        method: req.method,
        url: rota,
        status: res.statusCode,
        duration_ms: Date.now() - inicio,
        request_id: requestId,
        tenant_id: tid,
      }),
    );

    // health checks (probes k8s) e métricas não têm tenant
    if (rota.includes('/health') || rota.includes('/metrics')) {
      return next();
    }

    // Host de plataforma (PLATFORM_HOST) → modo cross-tenant para o super_admin.
    // Deve ser verificado ANTES da resolução de tenant para evitar o 404.
    if (process.env.PLATFORM_HOST && host === process.env.PLATFORM_HOST) {
      return TenantContext.run({ isPlatform: true, requestId }, () => next());
    }

    if (req.path.startsWith('/_platform')) {
      return TenantContext.run({ isPlatform: true, requestId }, () => next());
    }

    const tenantId = await this.resolve(host);
    if (!tenantId) {
      throw new NotFoundException(`Nenhuma prefeitura configurada para "${host}".`);
    }
    tid = tenantId;
    // Importante: o restante da cadeia (controllers/services/Prisma) roda
    // dentro deste contexto, então o RLS é aplicado automaticamente.
    TenantContext.run({ tenantId, requestId }, () => next());
  }

  /** Domínio base da plataforma (subdomínios são automáticos via curinga CF). */
  private get baseDominio(): string {
    return process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
  }

  private async resolve(host: string): Promise<string | undefined> {
    const key = `tenant:host:${host}`;
    const cached = await this.cache.get<string>(key);
    if (cached) return cached;

    // O Host chega completo ("prefeiturademo.lidera.app.br"), mas o formulário
    // de criação grava o subdomínio como prefixo ("prefeiturademo"). Aceitamos
    // ambas as formas: host completo (domínio próprio ou subdomínio gravado por
    // extenso) e o prefixo do subdomínio da plataforma.
    const sufixo = `.${this.baseDominio}`;
    const prefixo = host.endsWith(sufixo) ? host.slice(0, -sufixo.length) : null;

    // Consulta a tabela-registro em modo plataforma (sem RLS de tenant).
    const tenant = await this.prisma.platform().tenant.findFirst({
      where: {
        ativo: true,
        OR: [
          { dominio: host },
          { subdominio: host },
          ...(prefixo ? [{ subdominio: prefixo }] : []),
        ],
      },
      select: { id: true },
    });
    if (tenant) await this.cache.set(key, tenant.id, TTL_TENANT);
    return tenant?.id;
  }
}
