/**
 * RLS do sistema de menus (menu_items). Conecta como `portal_app` (papel
 * comum NOSUPERUSER/NOBYPASSRLS, idêntico à produção). Valida:
 *   - Isolamento: tenant A não vê itens de tenant B.
 *   - Fail-safe: sem contexto, nenhum item é retornado.
 *   - WITH CHECK: bloqueia INSERT cross-tenant.
 *   - Modo plataforma enxerga todos os tenants.
 *
 * Pré-requisito: Postgres com migrations db/*.sql aplicadas (incl. 018_menus.sql).
 *   DATABASE_URL=postgresql://portal:portal@127.0.0.1:5433/portal (padrão)
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

  // Papel de aplicação idêntico ao de produção
  await admin.query(`
    DO $$ BEGIN
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

  // Semeia 2 tenants + 1 item de menu cada
  for (const [id, slug] of [
    [TENANT_A, 'alfa'],
    [TENANT_B, 'beta'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1,$2,$3,'MT')`,
      [id, `menu-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
    await admin.query(
      `INSERT INTO menu_items (tenant_id, local, label, tipo, href, ordem)
       VALUES ($1, 'cabecalho', $2, 'interno', '/', 0)`,
      [id, `Início ${slug}`],
    );
  }

  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin) {
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

describe('menu_items — RLS (isolamento por tenant)', () => {
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

  it('tenant A vê só o seu item de menu', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query(`SELECT tenant_id, label FROM menu_items WHERE local = 'cabecalho'`).then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
    expect(rows[0].label).toContain('alfa');
  });

  it('tenant B vê só o seu item de menu', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query(`SELECT tenant_id FROM menu_items`).then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_B);
  });

  it('sem contexto não vê nenhum item (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT * FROM menu_items').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('bloqueia INSERT cross-tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO menu_items (tenant_id, local, label, tipo, href, ordem)
           VALUES ($1, 'cabecalho', 'hack', 'interno', '/hack', 0)`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE não afeta linhas de outro tenant', async () => {
    const res = await withTenant(TENANT_A, (c) =>
      c.query(
        `UPDATE menu_items SET label = 'hackeado' WHERE tenant_id = $1`,
        [TENANT_B],
      ),
    );
    expect(res.rowCount).toBe(0);
  });

  it('modo plataforma enxerga itens de ambos os tenants', async () => {
    const rows = await withPlatform((c) =>
      c
        .query(
          `SELECT DISTINCT tenant_id FROM menu_items WHERE tenant_id = ANY($1::uuid[])`,
          [[TENANT_A, TENANT_B]],
        )
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(2);
  });
});
