-- =====================================================================
-- 101 — Biblioteca: taxonomias gerenciáveis (Tipos de mídia + Categorias)
-- =====================================================================
-- O acervo (016_media_library.sql) já classifica cada asset por um FORMATO
-- fixo do sistema (enum media_tipo: imagem/documento/video/audio/outro), que
-- controla preview, validação de MIME e o caminho de storage — esse enum NÃO
-- muda. Esta migration acrescenta duas taxonomias GERENCIÁVEIS pelo admin,
-- gerenciadas no hub "Tipos e Taxonomias" (/admin/tipos):
--
--   • media_tipos      — "Tipos de mídia" livres (rótulo opcional na mídia:
--                        ex. Podcast, Transmissão ao vivo, Galeria 2024).
--                        NÃO altera preview/MIME/storage.
--   • media_categories — já existia; ganha `ativo` para permitir desativar
--                        uma categoria em uso (FK RESTRICT) sem excluí-la.
--
-- Tudo tenant-scoped com RLS (mesmo padrão de media_categories). Ver
-- api/src/modules/media/media-taxonomias.controller.ts.
-- =====================================================================

-- ---- Tipos de mídia (taxonomia editável) --------------------------------
CREATE TABLE IF NOT EXISTS media_tipos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          text        NOT NULL,
  slug          citext      NOT NULL,
  descricao     text,
  icone         text,                                  -- rótulo/ícone opcional
  cor           text,                                  -- hex opcional (ex.: #1351b4)
  ordem         integer     NOT NULL DEFAULT 0,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('media_tipos');

-- ---- Categorias: `ativo` (desativar em vez de excluir quando em uso) -----
ALTER TABLE media_categories
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- ---- Vínculo OPCIONAL do asset com um "tipo de mídia" (rótulo) -----------
-- ON DELETE SET NULL: excluir o tipo apenas remove o rótulo; nunca apaga mídia.
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS tipo_midia_id uuid REFERENCES media_tipos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_tipo_midia
  ON media_assets (tenant_id, tipo_midia_id);

-- ---- GRANT ao role da aplicação (idempotente; tabela nova) ---------------
-- media_categories/media_assets já têm grant; só a tabela nova precisa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_tipos TO portal_app;
  END IF;
END$$;
