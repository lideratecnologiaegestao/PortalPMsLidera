/**
 * RLS dos Formulários (formularios / formulario_envios).
 * Conecta como `portal_app` (papel comum, igual produção).
 * Valida isolamento por tenant: tenant A não vê dados de tenant B.
 *
 * Pré-requisitos: container PostGIS rodando na porta 5433
 * (ver MEMORY: rls-test-local-env.md).
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

let formAId: string;
let formBId: string;
let envioAId: string;
let envioBId: string;

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Garante o role portal_app
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

  // Cria os dois tenants de teste
  for (const [id, slug] of [
    [TENANT_A, 'form-alfa'],
    [TENANT_B, 'form-beta'],
  ] as [string, string][]) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1,$2,$3,'MT') ON CONFLICT DO NOTHING`,
      [id, `${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
  }

  // Insere formulários como superuser (bypassa RLS para seed)
  formAId = randomUUID();
  formBId = randomUUID();
  await admin.query(
    `INSERT INTO formularios (id, tenant_id, slug, titulo) VALUES ($1,$2,'f-a','Form A'), ($3,$4,'f-b','Form B')`,
    [formAId, TENANT_A, formBId, TENANT_B],
  );

  // Insere envios
  envioAId = randomUUID();
  envioBId = randomUUID();
  await admin.query(
    `INSERT INTO formulario_envios (id, tenant_id, formulario_id) VALUES ($1,$2,$3), ($4,$5,$6)`,
    [envioAId, TENANT_A, formAId, envioBId, TENANT_B, formBId],
  );

  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin) {
    await admin.query(`DELETE FROM formulario_envios WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(`DELETE FROM formularios WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
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
  } finally {
    c.release();
  }
}

// ─── formularios ─────────────────────────────────────────────────────────────

describe('formularios — RLS', () => {
  it('tenant A vê apenas seu próprio formulário', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT id FROM formularios').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(formAId);
  });

  it('tenant B vê apenas seu próprio formulário', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM formularios').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(formBId);
  });

  it('sem contexto de tenant não vê nenhum formulário (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT id FROM formularios').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('tenant A não consegue inserir formulário com tenant_id de B (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO formularios (id, tenant_id, slug, titulo) VALUES ($1,$2,'hack-slug','Hack')`,
          [randomUUID(), TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ─── formulario_envios ───────────────────────────────────────────────────────

describe('formulario_envios — RLS', () => {
  it('tenant A vê apenas seus próprios envios', async () => {
    const rows = await withTenant(TENANT_A, (c) =>
      c.query('SELECT id FROM formulario_envios').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(envioAId);
  });

  it('tenant B vê apenas seus próprios envios', async () => {
    const rows = await withTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM formulario_envios').then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(envioBId);
  });

  it('sem contexto não vê nenhum envio (fail-safe)', async () => {
    const rows = await withTenant(null, (c) =>
      c.query('SELECT id FROM formulario_envios').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('tenant A não consegue inserir envio com tenant_id de B (WITH CHECK)', async () => {
    await expect(
      withTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO formulario_envios (id, tenant_id, formulario_id) VALUES ($1,$2,$3)`,
          [randomUUID(), TENANT_B, formBId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
