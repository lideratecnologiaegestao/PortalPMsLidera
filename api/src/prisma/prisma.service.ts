import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/tenant/tenant.context';

/** Client transacional (sem métodos de runtime) usado dentro de `tx()`. */
export type PrismaTx = Prisma.TransactionClient;

/**
 * Camada de acesso ao banco com Row Level Security automático.
 *
 * Como funciona:
 *   - `db`  → cada operação Prisma roda dentro de uma transação que primeiro
 *             executa `set_config('app.current_tenant_id', <tenant>, true)`.
 *             As policies RLS (ver db/001_*.sql) leem esse GUC e isolam os
 *             dados. O isolamento fica no banco, não confia só no app.
 *   - `platform()` → modo super_admin/jobs: seta `app.is_platform = on`,
 *             permitindo operar cross-tenant (registro de tenants, etc.).
 *
 * Tradeoff: como o GUC é `is_local = true`, ele só vale dentro da transação,
 * o que é seguro com pool de conexões. Em troca, toda query vira uma
 * transação curta. Para páginas públicas read-heavy (transparência), use
 * cache (Redis/ISR) por cima — o custo de RLS some no cache hit.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base = new PrismaClient();

  /** Cliente com escopo de tenant. Use este em todos os services. */
  readonly db = this.base.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        const ctx = TenantContext.get();

        if (ctx.isPlatform) {
          const [, res] = await this.base.$transaction([
            this.base.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`,
            query(args),
          ]);
          return res;
        }

        if (ctx.tenantId) {
          const [, res] = await this.base.$transaction([
            this.base
              .$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`,
            query(args),
          ]);
          return res;
        }

        // Sem contexto: RLS bloqueia tabelas tenant-scoped (comportamento fail-safe).
        return query(args);
      },
    },
  });

  private readonly platformClient = this.base.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        const [, res] = await this.base.$transaction([
          this.base.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`,
          query(args),
        ]);
        return res;
      },
    },
  });

  /** Operações de plataforma (super_admin / jobs internos / registro de tenants). */
  platform() {
    return this.platformClient;
  }

  /**
   * Transação interativa com RLS: seta o GUC do tenant UMA vez no início e
   * roda `fn` com o client transacional `tx`. Use quando várias escritas
   * precisam ser ATÔMICAS (ex.: atualizar status + gravar evento). Diferente
   * do `db` (que abre uma micro-transação por operação), aqui tudo entra na
   * mesma transação e o RLS continua valendo.
   */
  async tx<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    const ctx = TenantContext.get();
    return this.base.$transaction(async (t) => {
      if (ctx.isPlatform) {
        await t.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
      } else if (ctx.tenantId) {
        await t.$executeRaw`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`;
      }
      return fn(t);
    });
  }

  async onModuleInit() {
    await this.base.$connect();
  }
  async onModuleDestroy() {
    await this.base.$disconnect();
  }
}
