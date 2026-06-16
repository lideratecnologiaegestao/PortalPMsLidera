/**
 * Diário Oficial: RLS por tenant + IMUTABILIDADE da edição publicada (trigger).
 * Conecta como `portal_app` (papel comum, igual produção).
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
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='portal_app') THEN
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
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1,$2,$3,'MT')`,
      [id, `dia-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
    // edição PUBLICADA (status publicado) para testar imutabilidade
    await admin.query(
      `INSERT INTO diario_edicoes (tenant_id, numero, data_edicao, titulo, conteudo, status, hash, publicado_em)
       VALUES ($1, '2026-001', '2026-06-02', $2, 'conteudo', 'publicado', 'abc123', now())`,
      [id, `Edição ${slug}`],
    );
  }
  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin)
    await admin.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
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
    if (tenantId)
      await c.query(`SELECT set_config('app.current_tenant_id',$1,true)`, [tenantId]);
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

describe('Diário Oficial — RLS + imutabilidade', () => {
  it('tenant A vê só a própria edição', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT tenant_id FROM diario_edicoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT_A);
  });

  it('edição PUBLICADA é imutável (UPDATE bloqueado pelo trigger)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(`UPDATE diario_edicoes SET conteudo = 'adulterado' WHERE tenant_id = $1`, [
          TENANT_A,
        ]),
      ),
    ).rejects.toThrow(/imut[aá]vel/i);
  });

  it('bloqueia inserir edição em outro tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO diario_edicoes (tenant_id, numero, data_edicao, titulo)
           VALUES ($1, 'HACK', '2026-06-02', 'x')`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
