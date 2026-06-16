-- =====================================================================
-- OPCIONAL (não auto-aplicado) — RAG semântico com pgvector
-- =====================================================================
-- Upgrade da recuperação do RAG (hoje em full-text search) para busca por
-- EMBEDDINGS. Requer:
--   1. Imagem do Postgres com a extensão `vector` (pgvector) instalada — a
--      imagem postgis/postgis:16-3.4 NÃO inclui pgvector. Use uma imagem
--      combinada (postgis + pgvector) ou instale o pacote `postgresql-16-pgvector`.
--   2. Um provedor de embeddings (ex.: Voyage AI) — a API Anthropic não gera
--      embeddings. Ver EmbeddingsService (a implementar) com degradação.
--
-- Aplicar manualmente quando a infra suportar; não entra no glob db/*.sql.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Trechos do CMS publicado, vetorizados (1 linha por chunk).
CREATE TABLE cms_embeddings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_id     uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  trecho      text NOT NULL,
  embedding   vector(1024),                   -- dimensão do provedor (ex.: voyage-3)
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_emb_tenant ON cms_embeddings (tenant_id);
-- índice de similaridade por cosseno (IVFFlat — ajustar lists conforme volume)
CREATE INDEX idx_cms_emb_vec ON cms_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
SELECT app_enable_tenant_rls('cms_embeddings');

-- Consulta de recuperação (no código): top-K por menor distância de cosseno
--   SELECT page_id, trecho FROM cms_embeddings
--   ORDER BY embedding <=> $1::vector LIMIT 5;
