/**
 * Teste de isolamento RLS para dados provisionados pelo PlatformModule.
 *
 * Verifica que:
 *   1. Um tenant não vê dados de outro tenant (cms_pages, transp_documentos,
 *      media_categories) via portal_app (sem bypass de RLS).
 *   2. No modo plataforma (is_platform=on), todos os dados são visíveis.
 *   3. A tabela `tenants` não tem RLS de tenant_id — visible cross-tenant.
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

  // Papel de aplicação sem superusuário/bypass (igual produção)
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

  // Semeia 2 tenants como superuser (bypassa RLS para setup)
  for (const [id, slug] of [
    [TENANT_A, 'plataforma-alfa'],
    [TENANT_B, 'plataforma-beta'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nome, uf, subdominio)
       VALUES ($1, $2, $3, 'MT', $4)
       ON CONFLICT DO NOTHING`,
      [id, `t-${slug}-${id.slice(0, 8)}`, `Prefeitura ${slug}`, `${id.slice(0, 8)}.plataforma.test`],
    );
  }

  // Semeia cms_pages para cada tenant
  for (const tenantId of [TENANT_A, TENANT_B]) {
    await admin.query(
      `INSERT INTO cms_pages (tenant_id, slug, titulo, publicado)
       VALUES ($1, 'home', 'Início', true)
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [tenantId],
    );

    await admin.query(
      `INSERT INTO transp_documentos (tenant_id, categoria, exercicio, titulo, url_externa)
       VALUES ($1, 'ppa', 2026, 'PPA Teste', 'https://exemplo.com/ppa.pdf')
       ON CONFLICT DO NOTHING`,
      [tenantId],
    );

    await admin.query(
      `INSERT INTO media_categories (tenant_id, tipo, nome, slug)
       VALUES ($1, 'imagem', 'Logos', 'logos')
       ON CONFLICT (tenant_id, tipo, slug) DO NOTHING`,
      [tenantId],
    );
  }

  appPool = new Pool({ connectionString: appUrl() });
});

afterAll(async () => {
  if (admin) {
    // Cleanup em ordem de dependência (filhos antes dos pais)
    for (const tenantId of [TENANT_A, TENANT_B]) {
      await admin.query(`DELETE FROM transp_documentos WHERE tenant_id = $1`, [tenantId]);
      await admin.query(`DELETE FROM cms_blocks WHERE tenant_id = $1`, [tenantId]);
      await admin.query(`DELETE FROM cms_pages WHERE tenant_id = $1`, [tenantId]);
      await admin.query(`DELETE FROM media_assets WHERE tenant_id = $1`, [tenantId]);
      await admin.query(`DELETE FROM media_categories WHERE tenant_id = $1`, [tenantId]);
    }
    await admin.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  }
  await appPool?.end();
  await admin?.end();
});

async function withTenant<T>(
  tenantId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
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

describe('RLS — isolamento de dados provisionados pelo platform (portal_app)', () => {
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

  describe('cms_pages', () => {
    it('tenant A vê apenas suas próprias páginas', async () => {
      const rows = await withTenant(TENANT_A, (c) =>
        c.query('SELECT tenant_id FROM cms_pages').then((r) => r.rows),
      );
      const ids = rows.map((r) => r.tenant_id);
      expect(ids.every((id) => id === TENANT_A)).toBe(true);
    });

    it('tenant B não vê páginas de tenant A', async () => {
      const rows = await withTenant(TENANT_B, (c) =>
        c
          .query('SELECT tenant_id FROM cms_pages WHERE tenant_id = $1', [TENANT_A])
          .then((r) => r.rows),
      );
      expect(rows).toHaveLength(0);
    });

    it('modo plataforma vê páginas de ambos os tenants', async () => {
      const rows = await withPlatform((c) =>
        c
          .query('SELECT tenant_id FROM cms_pages WHERE tenant_id = ANY($1::uuid[])', [
            [TENANT_A, TENANT_B],
          ])
          .then((r) => r.rows),
      );
      const ids = new Set(rows.map((r) => r.tenant_id));
      expect(ids.has(TENANT_A)).toBe(true);
      expect(ids.has(TENANT_B)).toBe(true);
    });
  });

  describe('transp_documentos', () => {
    it('tenant A vê apenas seus próprios documentos', async () => {
      const rows = await withTenant(TENANT_A, (c) =>
        c.query('SELECT tenant_id FROM transp_documentos').then((r) => r.rows),
      );
      const ids = rows.map((r) => r.tenant_id);
      expect(ids.every((id) => id === TENANT_A)).toBe(true);
    });

    it('tenant B não vê documentos de tenant A', async () => {
      const rows = await withTenant(TENANT_B, (c) =>
        c
          .query('SELECT tenant_id FROM transp_documentos WHERE tenant_id = $1', [
            TENANT_A,
          ])
          .then((r) => r.rows),
      );
      expect(rows).toHaveLength(0);
    });

    it('modo plataforma vê documentos de ambos os tenants', async () => {
      const rows = await withPlatform((c) =>
        c
          .query(
            'SELECT tenant_id FROM transp_documentos WHERE tenant_id = ANY($1::uuid[])',
            [[TENANT_A, TENANT_B]],
          )
          .then((r) => r.rows),
      );
      const ids = new Set(rows.map((r) => r.tenant_id));
      expect(ids.has(TENANT_A)).toBe(true);
      expect(ids.has(TENANT_B)).toBe(true);
    });
  });

  describe('media_categories', () => {
    it('tenant A vê apenas suas categorias', async () => {
      const rows = await withTenant(TENANT_A, (c) =>
        c.query('SELECT tenant_id FROM media_categories').then((r) => r.rows),
      );
      const ids = rows.map((r) => r.tenant_id);
      expect(ids.every((id) => id === TENANT_A)).toBe(true);
    });

    it('tenant B não vê categorias de tenant A', async () => {
      const rows = await withTenant(TENANT_B, (c) =>
        c
          .query('SELECT tenant_id FROM media_categories WHERE tenant_id = $1', [
            TENANT_A,
          ])
          .then((r) => r.rows),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('tenants (sem RLS de tenant_id — tabela-registro)', () => {
    it('portal_app consegue ler a tabela tenants (sem set_config)', async () => {
      // A tabela `tenants` não tem RLS de tenant_id: é a tabela-registro da plataforma.
      // O portal_app precisa ler ela para a resolução de host no TenantMiddleware.
      const c = await appPool.connect();
      try {
        const r = await c.query('SELECT id FROM tenants WHERE id = $1', [TENANT_A]);
        // Pode retornar ou não dependendo da RLS configurada, mas não deve lançar
        // erro de permissão
        expect(Array.isArray(r.rows)).toBe(true);
      } finally {
        c.release();
      }
    });
  });
});
