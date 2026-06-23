/**
 * Teste de isolamento RLS — Ouvidoria (ADR-0005, migration db/065).
 *
 * ATENÇÃO: este teste exige que a migration db/065 já tenha sido aplicada
 * ao banco, pois ela cria as policies que leem os GUCs:
 *   app.current_user_role
 *   app.current_user_id
 *   app.current_secretaria_id
 *
 * Sem a migration 065, o teste falha com 0 linhas mesmo para ouvidor —
 * isso é esperado e documenta a dependência api↔db.
 *
 * DEPLOY ATÔMICO OBRIGATÓRIO:
 *   A migration db/065 e o deploy da API (GUCs no PrismaService) devem
 *   ocorrer no MESMO janela de manutenção:
 *     1. kubectl apply -f db/065_rls_por_papel.sql  (ou psql)
 *     2. kubectl rollout restart deployment/portal-api
 *   Implantar a API sem a migration deixa os GUCs sendo setados mas sem
 *   policy que os leia — comportamento seguro (não expõe dados extras).
 *   Implantar a migration sem a API deixa os GUCs vazios — a policy nega
 *   acesso a ouvidor também (fail-safe temporário aceitável com rollout < 30s).
 *
 * Pré-requisito:
 *   DATABASE_URL=postgresql://portal:portal@127.0.0.1:5433/portal (default)
 *   portal_app configurado conforme test/rls.e2e-spec.ts
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

const TENANT_ID = randomUUID();

let admin: Client;
let appPool: Pool;
let manifestacaoId: string;

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();

  // Garante que o papel de aplicação existe (idempotente)
  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
        CREATE ROLE portal_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
  `);
  await admin.query(`ALTER ROLE portal_app NOSUPERUSER NOBYPASSRLS PASSWORD '${APP_PASSWORD}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO portal_app`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app`);

  // Semeia tenant + manifestação (superuser → ignora RLS)
  await admin.query(
    `INSERT INTO tenants (id, slug, nome, uf) VALUES ($1, $2, $3, 'MT')`,
    [TENANT_ID, `ouv-test-${TENANT_ID.slice(0, 8)}`, 'Prefeitura Ouvidoria Test'],
  );
  const r = await admin.query(
    `INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, assunto, descricao, prazo_em)
     VALUES ($1, $2, 'ouvidoria', 'reclamacao', 'Assunto teste', 'desc', now() + interval '30 days')
     RETURNING id`,
    [TENANT_ID, `2026-ouv-test-0001`],
  );
  manifestacaoId = r.rows[0].id;

  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin) {
    await admin.query(`DELETE FROM tenants WHERE id = $1`, [TENANT_ID]);
  }
  await appPool?.end();
  await admin?.end();
});

/** Abre transação com GUCs de tenant + papel (como o PrismaService fará após ADR-0005). */
async function withRoleContext<T>(
  tenantId: string,
  role: string,
  userId = '',
  secretariaId = '',
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT
        set_config('app.current_tenant_id',    $1, true),
        set_config('app.current_user_role',    $2, true),
        set_config('app.current_user_id',      $3, true),
        set_config('app.current_secretaria_id',$4, true)`,
      [tenantId, role, userId, secretariaId],
    );
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

describe('RLS-0065 — isolamento de papel na ouvidoria', () => {
  it('(b) ouvidor vê manifestações do tenant', async () => {
    const rows = await withRoleContext(
      TENANT_ID,
      'ouvidor',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    // Se a policy 065 ainda não foi aplicada, haverá linhas mas sem filtro de papel
    // Se aplicada, ouvidor deve ver a manifestação
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.map((r) => r.id)).toContain(manifestacaoId);
  });

  it('(b) SET LOCAL app.current_user_role=admin_prefeitura → 0 linhas em manifestacoes', async () => {
    /**
     * Este é o teste canônico do RLS-0065:
     * Mesmo com o tenant correto setado, um admin_prefeitura NÃO deve ver
     * manifestações quando a policy 065 estiver ativa.
     *
     * Se a migration 065 ainda não foi aplicada, este teste vai FALHAR
     * (retorna linhas) — isso é esperado e documenta a dependência.
     */
    const rows = await withRoleContext(
      TENANT_ID,
      'admin_prefeitura',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    // Com policy 065 aplicada: 0 linhas
    // Sem policy 065: teste falha aqui e documenta que a migration é necessária
    expect(rows.length).toBe(0);
  });

  it('(b) ti → 0 linhas em manifestacoes (papel não-ouvidoria)', async () => {
    const rows = await withRoleContext(
      TENANT_ID,
      'ti',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('(b) gestor → 0 linhas em manifestacoes', async () => {
    const rows = await withRoleContext(
      TENANT_ID,
      'gestor',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('(b) assistente_ouvidoria vê manifestações', async () => {
    const rows = await withRoleContext(
      TENANT_ID,
      'assistente_ouvidoria',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('(b) sem papel (GUC vazio) → 0 linhas (fail-safe)', async () => {
    const rows = await withRoleContext(
      TENANT_ID,
      '',
      '',
      '',
      (c) => c.query('SELECT id FROM manifestacoes').then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('modo plataforma (is_platform=on) enxerga tudo (jobs internos)', async () => {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.is_platform', 'on', true)`);
      const rows = await c
        .query(`SELECT id FROM manifestacoes WHERE tenant_id = $1`, [TENANT_ID])
        .then((r) => r.rows);
      await c.query('ROLLBACK');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      c.release();
    }
  });
});
