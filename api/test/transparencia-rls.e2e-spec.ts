/**
 * RLS + idempotência das tabelas de Transparência (`transp_*`).
 *
 * Conecta como `portal_app` (NOSUPERUSER/NOBYPASSRLS), igual produção — pois
 * superusuário ignora RLS. Valida:
 *  - isolamento por tenant em transp_despesas;
 *  - idempotência da chave natural (UNIQUE tenant_id, exercicio, empenho):
 *    reprocessar a "mesma carga" via UPSERT não duplica.
 *
 * Pré-requisito: Postgres com db/*.sql aplicadas (DATABASE_URL, default 5433).
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

  for (const [id, slug] of [
    [TENANT_A, 'alfa'],
    [TENANT_B, 'beta'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1, $2, $3, 'MT')`,
      [id, `transp-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
    // 1 despesa por tenant (mesmo empenho '0001' — chave natural é por tenant)
    await admin.query(
      `INSERT INTO transp_despesas (tenant_id, exercicio, empenho, orgao, valor_pago)
       VALUES ($1, 2026, '0001', $2, 1000)`,
      [id, `Secretaria ${slug}`],
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
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

describe('Transparência — RLS + idempotência (transp_despesas)', () => {
  it('tenant A vê só as despesas de A', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM transp_despesas').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('sem contexto não vê nada (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT * FROM transp_despesas').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('bloqueia INSERT cross-tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO transp_despesas (tenant_id, exercicio, empenho) VALUES ($1, 2026, '9999')`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('idempotência: reprocessar a mesma carga (UPSERT) não duplica e atualiza valor', async () => {
    // simula 2 execuções do ETL com o mesmo empenho '0001' do tenant A
    const upsert = (valor: number) =>
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO transp_despesas (tenant_id, exercicio, empenho, valor_pago)
           VALUES ($1, 2026, '0001', $2)
           ON CONFLICT (tenant_id, exercicio, empenho)
           DO UPDATE SET valor_pago = EXCLUDED.valor_pago`,
          [TENANT_A, valor],
        ),
      );
    await upsert(2500);
    await upsert(2500); // reprocesso

    const rows = await withTenant(TENANT_A, (c) =>
      c
        .query(`SELECT valor_pago FROM transp_despesas WHERE exercicio=2026 AND empenho='0001'`)
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(1); // não duplicou
    expect(Number(rows[0].valor_pago)).toBe(2500); // atualizou
  });
});
