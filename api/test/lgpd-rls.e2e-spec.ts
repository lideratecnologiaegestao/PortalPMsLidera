/**
 * Teste de ISOLAMENTO RLS — módulo LGPD
 *
 * Verifica que:
 * 1. Cidadão A não vê solicitações do Cidadão B (mesma tenant, titularId diferente).
 * 2. Admin da Tenant A não vê solicitações/incidentes da Tenant B.
 * 3. Incidentes: cidadão (role cidadao) não vê nenhum registro.
 * 4. Operações cross-tenant são silenciosamente bloqueadas (0 linhas afetadas).
 *
 * Conecta como portal_app (NOSUPERUSER NOBYPASSRLS) — igual à produção.
 * DATABASE_URL: vide memory/rls-test-local-env.md
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
const USER_A1 = randomUUID(); // titular do tenant A
const USER_A2 = randomUUID(); // segundo titular do tenant A
const USER_B1 = randomUUID(); // titular do tenant B
const ADMIN_A = randomUUID(); // admin do tenant A

let admin: Client;
let appPool: Pool;

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Garante papel portal_app sem superusuário/bypassrls
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

  // Semeia 2 tenants
  for (const [id, slug] of [
    [TENANT_A, 'lgpd-alfa'],
    [TENANT_B, 'lgpd-beta'],
  ] as [string, string][]) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1, $2, $3, 'MT')
       ON CONFLICT (slug) DO NOTHING`,
      [id, `${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`],
    );
  }

  // Semeia usuários
  const users: [string, string, string][] = [
    [USER_A1, TENANT_A, 'cidadao'],
    [USER_A2, TENANT_A, 'cidadao'],
    [USER_B1, TENANT_B, 'cidadao'],
    [ADMIN_A, TENANT_A, 'admin_prefeitura'],
  ];
  for (const [id, tenantId, role] of users) {
    await admin.query(
      `INSERT INTO users (id, tenant_id, nome, email, role)
       VALUES ($1, $2, $3, $4, $5::user_role)
       ON CONFLICT DO NOTHING`,
      [id, tenantId, `User ${id.slice(0, 8)}`, `${id.slice(0, 8)}@test.invalid`, role],
    );
  }

  // Semeia solicitações: 1 para cada titular
  await admin.query(
    `INSERT INTO solicitacoes_titular (id, tenant_id, titular_id, tipo, status, prazo_em)
     VALUES
       ($1, $2, $3, 'acesso', 'aberta', now() + interval '15 days'),
       ($4, $2, $5, 'correcao', 'aberta', now() + interval '15 days'),
       ($6, $7, $8, 'eliminacao', 'aberta', now() + interval '15 days')`,
    [
      randomUUID(), TENANT_A, USER_A1,
      randomUUID(), TENANT_A, USER_A2,  // mesmo tenant, titular diferente
      randomUUID(), TENANT_B, USER_B1,
    ],
  );

  // Semeia 1 incidente por tenant
  await admin.query(
    `INSERT INTO incidentes_seguranca
       (id, tenant_id, titulo, descricao, categoria, severidade, dados_afetados, detectado_em, prazo_comunicacao_em, status)
     VALUES
       ($1, $2, 'Inc A', 'desc', 'acesso_indevido', 'media', ARRAY[]::text[], now(), now() + interval '5 days', 'registrado'),
       ($3, $4, 'Inc B', 'desc', 'vazamento', 'alta',  ARRAY['email']::text[], now(), now() + interval '2 days', 'registrado')`,
    [randomUUID(), TENANT_A, randomUUID(), TENANT_B],
  );

  appPool = new Pool({ connectionString: appUrl() });
}, 20_000);

afterAll(async () => {
  if (admin) {
    // Remove os dados semeados (cascata via FK onde aplicável)
    await admin.query(
      `DELETE FROM incidentes_seguranca WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(
      `DELETE FROM solicitacoes_titular WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(
      `DELETE FROM users WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(
      `DELETE FROM tenants WHERE id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
  }
  await appPool?.end();
  await admin?.end();
}, 10_000);

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Executa fn com contexto de tenant + userId + role setados (GUC local).
 * Simula exatamente o que o PrismaService faz em produção.
 */
async function withCtx<T>(
  tenantId: string,
  userId: string,
  role: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await c.query(`SELECT set_config('app.current_user_role', $1, true)`, [role]);
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

// ── Solicitações do Titular ────────────────────────────────────────────────────

describe('RLS — solicitacoes_titular: isolamento de titular', () => {
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

  it('cidadão A1 vê apenas as próprias solicitações (não as de A2)', async () => {
    const rows = await withCtx(TENANT_A, USER_A1, 'cidadao', (c) =>
      c
        .query('SELECT titular_id FROM solicitacoes_titular')
        .then((r) => r.rows),
    );
    // RLS policy: cidadao vê somente titular_id = current_user_id
    expect(rows.every((r) => r.titular_id === USER_A1)).toBe(true);
    expect(rows.some((r) => r.titular_id === USER_A2)).toBe(false);
  });

  it('admin_prefeitura do tenant A vê TODAS as solicitações do tenant A', async () => {
    const rows = await withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
      c
        .query('SELECT titular_id FROM solicitacoes_titular')
        .then((r) => r.rows),
    );
    const titulares = rows.map((r) => r.titular_id);
    expect(titulares).toContain(USER_A1);
    expect(titulares).toContain(USER_A2);
    // Não deve conter o titular do tenant B
    expect(titulares).not.toContain(USER_B1);
  });

  it('admin_prefeitura do tenant A NÃO vê solicitações do tenant B', async () => {
    const rows = await withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
      c
        .query(
          `SELECT id FROM solicitacoes_titular WHERE titular_id = $1`,
          [USER_B1],
        )
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('INSERT cross-tenant é bloqueado pelo RLS (WITH CHECK)', async () => {
    await expect(
      withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
        c.query(
          `INSERT INTO solicitacoes_titular (tenant_id, titular_id, tipo, status, prazo_em)
           VALUES ($1, $2, 'acesso', 'aberta', now() + interval '15 days')`,
          [TENANT_B, USER_B1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('sem contexto de tenant → nenhuma solicitação visível (fail-safe)', async () => {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query('SELECT id FROM solicitacoes_titular');
      await c.query('ROLLBACK');
      expect(r.rows.length).toBe(0);
    } catch {
      await c.query('ROLLBACK').catch(() => undefined);
      throw new Error('Query falhou sem contexto — esperava resultado vazio');
    } finally {
      c.release();
    }
  });
});

// ── Incidentes de Segurança ────────────────────────────────────────────────────

describe('RLS — incidentes_seguranca: isolamento de tenant', () => {
  it('admin_prefeitura do tenant A vê apenas incidentes do tenant A', async () => {
    const rows = await withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
      c
        .query('SELECT tenant_id FROM incidentes_seguranca')
        .then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it('cidadão NÃO vê nenhum incidente (role não autorizada pela policy)', async () => {
    const rows = await withCtx(TENANT_A, USER_A1, 'cidadao', (c) =>
      c
        .query('SELECT id FROM incidentes_seguranca')
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('admin do tenant A NÃO vê incidentes do tenant B', async () => {
    const rows = await withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
      c
        .query(
          `SELECT id FROM incidentes_seguranca WHERE tenant_id = $1`,
          [TENANT_B],
        )
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('UPDATE cross-tenant não afeta linhas de outro tenant', async () => {
    const res = await withCtx(TENANT_A, ADMIN_A, 'admin_prefeitura', (c) =>
      c.query(
        `UPDATE incidentes_seguranca SET titulo = 'hack' WHERE tenant_id = $1`,
        [TENANT_B],
      ),
    );
    expect(res.rowCount).toBe(0);
  });
});
