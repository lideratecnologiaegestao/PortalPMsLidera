-- =====================================================================
-- 006 — Biblioteca de Mídia (categorias + assets) com RLS por tenant
-- =====================================================================
-- Repositório único de TODAS as mídias do portal. Dois escopos:
--   - publico:  ativos do portal (logos, brasão, banners, editais).
--               Têm URL pública MASCARADA servida pelo backend
--               (/midia/[tipo]/[categoria]/[hash].[ext]).
--   - restrito: mídia do cidadão e anexos internos. SEM rota pública;
--               acesso só por endpoint autenticado (RLS + RBAC + ownership).
-- O caminho real no storage (storage_key) NUNCA é exposto.
-- =====================================================================

-- Tipos de mídia e visibilidade ---------------------------------------
CREATE TYPE media_tipo        AS ENUM ('imagem', 'documento', 'video', 'audio', 'outro');
CREATE TYPE media_visibilidade AS ENUM ('publico', 'restrito');

-- Categorias (configuráveis por tenant; cada categoria pertence a um tipo)
CREATE TABLE media_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo       media_tipo NOT NULL,
  nome       text NOT NULL,                 -- "Logos"
  slug       citext NOT NULL,               -- "logos" (usado na URL pública)
  descricao  text,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, slug)
);
SELECT app_enable_tenant_rls('media_categories');

-- Assets (uma linha por arquivo) --------------------------------------
CREATE TABLE media_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo          media_tipo NOT NULL,
  categoria_id  uuid NOT NULL REFERENCES media_categories(id) ON DELETE RESTRICT,
  visibilidade  media_visibilidade NOT NULL DEFAULT 'restrito',
  nome_original text NOT NULL,              -- "logo.svg" / "brasao.svg"
  hash          text NOT NULL,             -- nome mascarado: "09h7789ahhdiochdpaueh"
  ext           text NOT NULL,             -- "svg"
  mime          text NOT NULL,             -- validado por magic bytes
  tamanho_bytes bigint NOT NULL,
  largura       int,                       -- imagens
  altura        int,                       -- imagens
  checksum      text,                      -- sha256 p/ dedup
  alt_text      text,                      -- obrigatório p/ imagem (validado no app)
  storage_key   text NOT NULL,             -- caminho REAL no storage (nunca exposto)
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  -- resolução da URL pública: tenant + tipo + categoria + hash
  UNIQUE (tenant_id, hash),
  UNIQUE (tenant_id, tipo, categoria_id, hash)
);
SELECT app_enable_tenant_rls('media_assets');

CREATE INDEX idx_media_assets_filtro    ON media_assets (tenant_id, tipo, categoria_id);
CREATE INDEX idx_media_assets_visib     ON media_assets (tenant_id, visibilidade);
CREATE INDEX idx_media_assets_checksum  ON media_assets (tenant_id, checksum);
CREATE INDEX idx_media_assets_busca     ON media_assets USING gin (nome_original gin_trgm_ops);

-- Unificação: anexos de manifestação e fotos de chamado passam a apontar
-- para a biblioteca (todos restrito). Mantém colunas antigas por
-- compatibilidade; novos registros usam media_asset_id.
ALTER TABLE manifestacao_anexos
  ADD COLUMN media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE chamado_fotos
  ADD COLUMN media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;

-- Observação de seed (executar por tenant na criação da prefeitura):
--   INSERT INTO media_categories (tenant_id, tipo, nome, slug) VALUES
--     ($t,'imagem','Logos','logos'),
--     ($t,'imagem','Brasões','brasoes'),
--     ($t,'imagem','Banners','banners'),
--     ($t,'imagem','Notícias','noticias'),
--     ($t,'imagem','Denúncias','denuncias'),       -- restrito
--     ($t,'documento','Editais','editais'),
--     ($t,'documento','Leis','leis'),
--     ($t,'documento','Protocolos','protocolos');  -- restrito
