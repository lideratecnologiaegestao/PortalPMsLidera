import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de execução por requisição. Carrega o tenant resolvido pelo
 * middleware e o usuário autenticado. É lido pelo PrismaService para
 * definir o GUC `app.current_tenant_id` (RLS) sem precisar passar o
 * tenantId manualmente em cada chamada de service.
 */
export interface RequestContext {
  tenantId?: string;     // UUID do tenant (undefined em rotas de plataforma)
  isPlatform?: boolean;  // true quando super_admin opera cross-tenant
  userId?: string;
  role?: string;
  requestId?: string;    // correlaciona logs da mesma requisição
}

const storage = new AsyncLocalStorage<RequestContext>();

export const TenantContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext {
    return storage.getStore() ?? {};
  },
  tenantId(): string | undefined {
    return storage.getStore()?.tenantId;
  },
  isPlatform(): boolean {
    return storage.getStore()?.isPlatform ?? false;
  },
};
