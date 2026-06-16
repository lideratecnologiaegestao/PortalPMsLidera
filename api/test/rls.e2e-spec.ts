/**
 * Teste de ISOLAMENTO RLS entre prefeituras (tenants).
 *
 * Ponto crítico (ver docs/12-infraestrutura.md): superusuário do Postgres
 * IGNORA todas as policies de RLS. Por isso o teste conecta como `portal_app`
 * — papel comum NOSUPERUSER/NOBYPASSRLS, idêntico ao de produção. A conexão
 * de superusuário (DATABASE_URL) é usada apenas para preparar o cenário.
 *
 * Pré-requisito: um Postgres com as migrations db/*.sql aplicadas.
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

  // 1. papel de aplicação SEM superusuário e SEM bypass de RLS (igual produção)
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

  // 2. semeia 2 prefeituras + 1 manifestação cada (como superuser → RLS ignorado)
  for (const [id, slug] of [
    [TENANT_A, 'alfa'],
    [TENANT_B, 'beta'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1, $2, $3, 'MT')`,
      [id, `t-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
    await admin.query(
      `INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, assunto, descricao, prazo_em)
       VALUES ($1, $2, 'esic', 'acesso_informacao', $3, 'desc', now() + interval '20 days')`,
      [id, `2026-${slug}-0001`, `Assunto ${slug}`],
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

/** Executa fn numa transação com o contexto de tenant setado (GUC local = RLS). */
async function withTenant<T>(
  tenantId: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) {
      await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
        tenantId,
      ]);
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

/** Executa fn em modo plataforma (super_admin/jobs) — enxerga cross-tenant. */
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

describe('RLS — isolamento entre prefeituras (papel portal_app)', () => {
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

  it('contexto do tenant A → vê apenas manifestações de A', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('contexto do tenant B → vê apenas manifestações de B', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT tenant_id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_B);
  });

  it('sem contexto de tenant → não vê nada (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT * FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('bloqueia INSERT cross-tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, assunto, descricao, prazo_em)
           VALUES ($1, 'x-cross', 'esic', 'acesso_informacao', 'a', 'd', now())`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE não afeta linhas de outro tenant', async () => {
    const res = await withTenant(TENANT_A, (c) =>
      c.query(`UPDATE manifestacoes SET assunto = 'hack' WHERE tenant_id = $1`, [
        TENANT_B,
      ]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('modo plataforma enxerga todos os tenants', async () => {
    const rows = await withPlatform((c) =>
      c
        .query(
          `SELECT DISTINCT tenant_id FROM manifestacoes WHERE tenant_id = ANY($1::uuid[])`,
          [[TENANT_A, TENANT_B]],
        )
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(2);
  });
});
