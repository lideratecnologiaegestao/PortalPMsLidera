import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/tenant/tenant.context';
import { Role } from '../common/rbac/roles.enum';

/** Client transacional (sem métodos de runtime) usado dentro de `tx()`. */
export type PrismaTx = Prisma.TransactionClient;

/** UUID v4 simples — rejeita qualquer outra coisa para evitar injeção via GUC. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roles válidas no sistema — enum estático para sanitização do GUC. */
const ROLES_VALIDAS = new Set<string>(Object.values(Role));

/** Sanitiza um UUID antes de usá-lo em um SET LOCAL. Retorna '' se inválido. */
function sanitizeUuid(val: string | undefined): string {
  if (!val) return '';
  return UUID_RE.test(val) ? val : '';
}

/** Sanitiza uma role antes de usá-la em um SET LOCAL. Retorna '' se inválida. */
function sanitizeRole(val: string | undefined): string {
  if (!val) return '';
  return ROLES_VALIDAS.has(val) ? val : '';
}

/**
 * Camada de acesso ao banco com Row Level Security automático.
 *
 * Como funciona:
 *   - `db`  → cada operação Prisma roda dentro de uma transação que primeiro
 *             executa SET LOCAL dos GUCs de RLS:
 *               app.current_tenant_id   — isola dados por tenant
 *               app.current_user_role   — permite policies por papel (ADR-0005)
 *               app.current_user_id     — permite policies por proprietário
 *               app.current_secretaria_id — permite policies por área/secretaria
 *             As policies RLS (db/*.sql) leem esses GUCs e isolam os dados.
 *             O isolamento fica no banco — não confia só no app.
 *   - `platform()` → modo super_admin/jobs: seta `app.is_platform = on`,
 *             permitindo operar cross-tenant (registro de tenants, etc.).
 *
 * Sanitização: role e UUIDs são validados ANTES do SET LOCAL para evitar
 * injeção de GUC via valores controlados pelo usuário.
 *
 * Tradeoff: como o GUC é `is_local = true`, ele só vale dentro da transação,
 * o que é seguro com pool de conexões. Em troca, toda query vira uma
 * transação curta. Para páginas públicas read-heavy (transparência), use
 * cache (Redis/ISR) por cima — o custo de RLS some no cache hit.
 *
 * Rotas públicas/anônimas: GUCs de papel ficam vazios — a policy RLS já
 * trata esse caso bloqueando acesso a tabelas restritas por papel.
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
          // Sanitiza antes do SET LOCAL para evitar injeção via GUC
          const role         = sanitizeRole(ctx.role);
          const userId       = sanitizeUuid(ctx.userId);
          const secretariaId = sanitizeUuid(ctx.secretariaId);

          const [, res] = await this.base.$transaction([
            this.base.$executeRaw`SELECT
              set_config('app.current_tenant_id',    ${ctx.tenantId},  true),
              set_config('app.current_user_role',    ${role},          true),
              set_config('app.current_user_id',      ${userId},        true),
              set_config('app.current_secretaria_id',${secretariaId},  true)`,
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

  /**
   * Cliente com escopo de tenant + GUC `app.public_ouvidoria = 'on'`.
   *
   * Use para operações avulsas (findFirst, findMany, upsert, etc.) nos fluxos
   * PÚBLICOS do cidadão na Ouvidoria (acompanhar, mensagem, avaliação, anexo,
   * recurso). A validação de protocolo+chave deve ocorrer ANTES de usar este
   * cliente. Para operações atômicas (múltiplas escritas), prefira txPublicaOuvidoria().
   *
   * GARANTIAS: tenant_id = app_current_tenant() permanece nas policies RLS —
   * este cliente NUNCA permite cross-tenant.
   */
  private readonly dbPublicaOuvidoriaClient = this.base.$extends({
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
          const role         = sanitizeRole(ctx.role);
          const userId       = sanitizeUuid(ctx.userId);
          const secretariaId = sanitizeUuid(ctx.secretariaId);

          const [, res] = await this.base.$transaction([
            this.base.$executeRaw`SELECT
              set_config('app.current_tenant_id',    ${ctx.tenantId},  true),
              set_config('app.current_user_role',    ${role},          true),
              set_config('app.current_user_id',      ${userId},        true),
              set_config('app.current_secretaria_id',${secretariaId},  true),
              set_config('app.public_ouvidoria',     'on',             true)`,
            query(args),
          ]);
          return res;
        }

        return query(args);
      },
    },
  });

  /**
   * Acessa o cliente público de ouvidoria (tenant-scoped + GUC público ativo).
   * Ver docstring em `dbPublicaOuvidoriaClient`.
   */
  dbPublica() {
    return this.dbPublicaOuvidoriaClient;
  }

  /** Operações de plataforma (super_admin / jobs internos / registro de tenants). */
  platform() {
    return this.platformClient;
  }

  /**
   * Transação interativa com RLS: seta os GUCs de tenant + papel UMA vez no
   * início e roda `fn` com o client transacional `tx`. Use quando várias
   * escritas precisam ser ATÔMICAS (ex.: atualizar status + gravar evento).
   * Diferente do `db` (que abre uma micro-transação por operação), aqui tudo
   * entra na mesma transação e o RLS continua valendo.
   */
  async tx<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    const ctx = TenantContext.get();
    return this.base.$transaction(async (t) => {
      if (ctx.isPlatform) {
        await t.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
      } else if (ctx.tenantId) {
        const role         = sanitizeRole(ctx.role);
        const userId       = sanitizeUuid(ctx.userId);
        const secretariaId = sanitizeUuid(ctx.secretariaId);

        await t.$executeRaw`SELECT
          set_config('app.current_tenant_id',    ${ctx.tenantId},  true),
          set_config('app.current_user_role',    ${role},          true),
          set_config('app.current_user_id',      ${userId},        true),
          set_config('app.current_secretaria_id',${secretariaId},  true)`;
      }
      return fn(t);
    });
  }

  /**
   * Transação com RLS para fluxos PÚBLICOS da Ouvidoria (cidadão sem papel de staff).
   *
   * Ativa o GUC `app.public_ouvidoria = 'on'` DENTRO da transação, permitindo
   * que as policies de SELECT/UPDATE/DELETE das tabelas de ouvidoria (definidas
   * em db/068_ouvidoria_public_guc.sql) autorizem o acesso sem exigir papel
   * 'ouvidor'/'assistente_ouvidoria'.
   *
   * GARANTIAS DE SEGURANÇA:
   *   • tenant_id = app_current_tenant() PERMANECE no predicado das policies —
   *     o GUC público NUNCA permite cross-tenant.
   *   • O GUC é SET LOCAL (dura apenas dentro desta transação) — pool seguro.
   *   • Deve ser chamado SOMENTE após validar protocolo+chave na camada de app.
   *   • Não alterar o admin service (staff continua pelo caminho normal com papel).
   *
   * Fluxos que devem usar este método:
   *   registrar(), acompanhar*(), mensagemCidadao(), avaliar(), anexoCidadao(),
   *   recursoCidadao(), recuperarProtocolos() (leitura por e-mail).
   */
  async txPublicaOuvidoria<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    const ctx = TenantContext.get();
    return this.base.$transaction(async (t) => {
      if (ctx.isPlatform) {
        // Contexto de plataforma já tem acesso irrestrito — GUC extra desnecessário.
        await t.$executeRaw`SELECT set_config('app.is_platform', 'on', true)`;
      } else if (ctx.tenantId) {
        const role         = sanitizeRole(ctx.role);
        const userId       = sanitizeUuid(ctx.userId);
        const secretariaId = sanitizeUuid(ctx.secretariaId);

        // Seta todos os GUCs normais de tenant MAIS o flag público da ouvidoria.
        await t.$executeRaw`SELECT
          set_config('app.current_tenant_id',    ${ctx.tenantId},  true),
          set_config('app.current_user_role',    ${role},          true),
          set_config('app.current_user_id',      ${userId},        true),
          set_config('app.current_secretaria_id',${secretariaId},  true),
          set_config('app.public_ouvidoria',     'on',             true)`;
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
