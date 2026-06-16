-- =====================================================================
-- 051 — Versionamento/backup de páginas do CMS (bloco 9 do TR)
-- =====================================================================
-- Snapshot do estado da página (título + seo + blocos) antes de salvar/excluir,
-- permitindo restaurar versões anteriores. RLS por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cms_page_snapshots (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_id    uuid        NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  titulo     text        NOT NULL,
  -- estado completo: { titulo, publicado, seo, blocos: [{tipo,conteudo,ordem,visivel}] }
  snapshot   jsonb       NOT NULL,
  motivo     text,                 -- ex.: 'antes_de_salvar' | 'antes_de_excluir' | 'manual'
  criado_por uuid        REFERENCES users(id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  cms_page_snapshots IS 'Versões/backup de páginas do CMS (título+seo+blocos em JSONB) para restauração. RLS por tenant.';
COMMENT ON COLUMN cms_page_snapshots.snapshot IS 'Estado completo da página no momento do snapshot: titulo, publicado, seo, blocos[].';

CREATE INDEX IF NOT EXISTS idx_cms_snap_page ON cms_page_snapshots (page_id, criado_em DESC);

SELECT app_enable_tenant_rls('cms_page_snapshots');
