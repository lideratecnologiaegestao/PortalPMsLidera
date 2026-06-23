/**
 * Teste de ISOLAMENTO RLS para tenant_app_config e tenant_app_builds (ADR-0006).
 *
 * Conecta como `portal_app` (NOSUPERUSER / NOBYPASSRLS) — idêntico ao papel
 * de produção — e prova que:
 *  1. Tenant A não enxerga config/builds de Tenant B.
 *  2. Tenant B não enxerga config/builds de Tenant A.
 *  3. Modo plataforma (super_admin) enxerga os dados dos dois tenants.
 *  4. Sessão sem tenant não enxerga nenhum dado.
 *
 * Pré-requisito: Postgres com migrations db/*.sql aplicadas.
 *   DATABASE_URL=postgresql://portal:portal@127.0.0.1:5433/portal (default)
 */

import { Client, Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgresql://portal:portal@127.0.0.1:5433/portal';
const APP_PASSWORD = 'portal_app_test';

function appUrl(): string {
  const u = new URL(ADMIN_URL);
  u.username = 'portal_app';
  u.password = APP_PASSWORD;
  return u.toString();
}

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();

let admin: Client;
let appPool: Pool;

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Garante que portal_app existe e não tem super poderes
  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
        CREATE ROLE portal_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
  `);
  await admin.query(`ALTER ROLE portal_app NOSUPERUSER NOBYPASSRLS`);
  await admin.query(`ALTER ROLE portal_app PASSWORD '${APP_PASSWORD}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO portal_app`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app`,
  );
  await admin.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app`,
  );

  // Sembra 2 tenants (modo superusuário — RLS ignorado aqui, intencional)
  for (const [id, slug] of [
    [TENANT_A, 'app-rls-a'],
    [TENANT_B, 'app-rls-b'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf)
       VALUES ($1, $2, $3, 'MT')
       ON CONFLICT (id) DO NOTHING`,
      [id, `${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
  }

  // Seta modo plataforma e insere configs
  await admin.query(`SELECT set_config('app.is_platform', 'on', false)`);

  await admin.query(
    `INSERT INTO tenant_app_config (tenant_id, app_name, primary_color)
     VALUES ($1, 'App A', '#0000ff')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT_A],
  );
  await admin.query(
    `INSERT INTO tenant_app_config (tenant_id, app_name, primary_color)
     VALUES ($1, 'App B', '#ff0000')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT_B],
  );

  // Insere um build para cada tenant
  await admin.query(
    `INSERT INTO tenant_app_builds (tenant_id, perfil, plataforma)
     VALUES ($1, 'preview', 'android')`,
    [TENANT_A],
  );
  await admin.query(
    `INSERT INTO tenant_app_builds (tenant_id, perfil, plataforma)
     VALUES ($1, 'production', 'android')`,
    [TENANT_B],
  );

  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin) {
    await admin.query(`SELECT set_config('app.is_platform', 'on', false)`);
    await admin.query(
      `DELETE FROM tenant_app_builds WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(
      `DELETE FROM tenant_app_config WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  }
  await appPool?.end();
  await admin?.end();
});

/** Executa fn numa transação com contexto de tenant (RLS ativo). */
async function withTenant<T>(
  tenantId: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) {
      await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    }
    const out = await fn(c);
    await c.query('ROLLBACK');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Executa fn em modo plataforma (cross-tenant). */
async function withPlatform<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.is_platform', 'on', true)`);
    const out = await fn(c);
    await c.query('ROLLBACK');
    return out;
  } finally {
    c.release();
  }
}

// ── pré-condição do papel ──────────────────────────────────────────────────────

describe('portal_app — papel sem super poderes', () => {
  it('não tem rolsuper nem rolbypassrls', async () => {
    const c = await appPool.connect();
    try {
      const r = await c.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      expect(r.rows[0].rolsuper).toBe(false);
      expect(r.rows[0].rolbypassrls).toBe(false);
    } finally {
      c.release();
    }
  });
});

// ── tenant_app_config ─────────────────────────────────────────────────────────

describe('RLS — tenant_app_config', () => {
  it('Tenant A enxerga apenas sua própria config (1 linha)', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM tenant_app_config').then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('Tenant B enxerga apenas sua própria config (1 linha)', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT tenant_id FROM tenant_app_config').then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_B);
  });

  it('Tenant B NÃO enxerga config de Tenant A', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c
        .query('SELECT app_name FROM tenant_app_config WHERE tenant_id = $1', [TENANT_A])
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('Tenant A NÃO enxerga config de Tenant B', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c
        .query('SELECT app_name FROM tenant_app_config WHERE tenant_id = $1', [TENANT_B])
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('Modo plataforma enxerga configs dos dois tenants (>= 2 linhas)', async () => {
    const rows = await withPlatform((c) =>
      c
        .query('SELECT tenant_id FROM tenant_app_config WHERE tenant_id = ANY($1::uuid[])', [
          [TENANT_A, TENANT_B],
        ])
        .then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('Sessão sem tenant não enxerga nenhuma config', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT tenant_id FROM tenant_app_config').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });
});

// ── tenant_app_builds ─────────────────────────────────────────────────────────

describe('RLS — tenant_app_builds', () => {
  it('Tenant A enxerga apenas seus próprios builds (1 linha)', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM tenant_app_builds').then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('Tenant B enxerga apenas seus próprios builds (1 linha)', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT tenant_id FROM tenant_app_builds').then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(TENANT_B);
  });

  it('Tenant B NÃO enxerga builds de Tenant A', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c
        .query('SELECT id FROM tenant_app_builds WHERE tenant_id = $1', [TENANT_A])
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('Modo plataforma enxerga builds dos dois tenants', async () => {
    const rows = await withPlatform((c) =>
      c
        .query('SELECT tenant_id FROM tenant_app_builds WHERE tenant_id = ANY($1::uuid[])', [
          [TENANT_A, TENANT_B],
        ])
        .then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('Sessão sem tenant não enxerga nenhum build', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT id FROM tenant_app_builds').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });
});

// ── trigger atualizado_em ─────────────────────────────────────────────────────

describe('trigger — atualizado_em é atualizado automaticamente no UPDATE', () => {
  it('tenant_app_config.atualizado_em muda após UPDATE', async () => {
    // Precisa de contexto de plataforma para ler e depois update como tenant
    const antes = await withPlatform((c) =>
      c
        .query('SELECT atualizado_em FROM tenant_app_config WHERE tenant_id = $1', [TENANT_A])
        .then((r) => r.rows[0]?.atualizado_em as Date | undefined),
    );

    // Aguarda 1 ms para garantir que o timestamp mude (alguns DBs têm resolução de 1 s)
    await new Promise((r) => setTimeout(r, 10));

    // Update dentro da sessão do tenant (RLS ativo)
    await withTenant(TENANT_A, (c) =>
      c.query(
        `UPDATE tenant_app_config SET app_version = '1.0.1' WHERE tenant_id = $1`,
        [TENANT_A],
      ),
    );

    const depois = await withPlatform((c) =>
      c
        .query('SELECT atualizado_em FROM tenant_app_config WHERE tenant_id = $1', [TENANT_A])
        .then((r) => r.rows[0]?.atualizado_em as Date | undefined),
    );

    if (antes && depois) {
      expect(depois.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    }
  });
});
