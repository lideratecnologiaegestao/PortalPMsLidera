/**
 * Teste de isolamento RLS da tabela `search_index` (migration 060).
 *
 * Garante que:
 *   - Tenant A não vê itens de Tenant B (SELECT isolado por RLS)
 *   - INSERT cross-tenant é bloqueado pelo WITH CHECK
 *   - UPDATE sem contexto de tenant não afeta linhas de outro tenant
 *   - Modo plataforma enxerga cross-tenant
 *
 * Conecta como `portal_app` (NOSUPERUSER/NOBYPASSRLS), idêntico à produção.
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

  // papel de aplicação sem super/bypassrls (igual produção)
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

  // Semeia 2 tenants + 1 item no search_index para cada
  for (const [id, slug] of [
    [TENANT_A, 'alfa-busca'],
    [TENANT_B, 'beta-busca'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1, $2, $3, 'MT')
       ON CONFLICT DO NOTHING`,
      [id, `t-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );

    // Insere item no search_index como superuser (RLS ignorado para setup)
    await admin.query(
      `INSERT INTO search_index
         (tenant_id, tipo, ref_id, titulo, url, corpo_tsv, peso)
       VALUES (
         $1::uuid, 'noticia', $2, $3, '/noticias/slug',
         to_tsvector('portuguese', $3),
         1.0
       )`,
      [id, `noticia-${slug}`, `Notícia do ${slug}`],
    );
  }

  appPool = new Pool({ connectionString: appUrl() });
}, 30_000);

afterAll(async () => {
  if (admin) {
    await admin.query(
      `DELETE FROM search_index WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  }
  await appPool?.end();
  await admin?.end();
});

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

describe('RLS — search_index isolamento entre prefeituras (papel portal_app)', () => {
  it('portal_app não é superusuário nem tem BYPASSRLS', async () => {
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

  it('contexto de tenant A → vê apenas itens de A no search_index', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM search_index').then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A);
    }
  });

  it('contexto de tenant B → vê apenas itens de B no search_index', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT tenant_id FROM search_index').then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_B);
    }
  });

  it('sem contexto de tenant → não vê nada (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT * FROM search_index').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('tenant A não vê item de B mesmo com filtro explícito', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c
        .query('SELECT * FROM search_index WHERE tenant_id = $1', [TENANT_B])
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('bloqueia INSERT cross-tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO search_index (tenant_id, tipo, ref_id, titulo, url, corpo_tsv, peso)
           VALUES ($1::uuid, 'noticia', 'cross-tenant', 'Hack', '/hack',
                  to_tsvector('portuguese', 'hack'), 1.0)`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE não afeta linhas de outro tenant', async () => {
    const res = await withTenant(TENANT_A, (c) =>
      c.query(
        `UPDATE search_index SET titulo = 'hacked' WHERE tenant_id = $1`,
        [TENANT_B],
      ),
    );
    expect(res.rowCount).toBe(0);
  });

  it('modo plataforma enxerga search_index de todos os tenants', async () => {
    const rows = await withPlatform((c) =>
      c
        .query(
          `SELECT DISTINCT tenant_id FROM search_index
           WHERE tenant_id = ANY($1::uuid[])`,
          [[TENANT_A, TENANT_B]],
        )
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(2);
    const ids = rows.map((r) => r.tenant_id);
    expect(ids).toContain(TENANT_A);
    expect(ids).toContain(TENANT_B);
  });

  it('busca FTS retorna apenas itens do tenant correto', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c
        .query(
          `SELECT ref_id, titulo
           FROM search_index
           WHERE corpo_tsv @@ websearch_to_tsquery('portuguese', 'Notícia')`,
        )
        .then((r) => r.rows),
    );
    // Deve retornar o item do tenant A
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Não deve retornar item de B
    for (const row of rows) {
      expect(row.ref_id).not.toBe('noticia-beta-busca');
    }
  });
});
