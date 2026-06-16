-- =====================================================================
-- 054 — Busca semântica do assistente (camada 4): pgvector + ia_chunks
-- =====================================================================
-- Corpus vetorial UNIFICADO por tenant: pedaços (chunks) de TODAS as fontes
-- (CMS, serviços, notícias, secretarias, documentos, base de conhecimento)
-- com embedding. A recuperação semântica usa similaridade de cosseno.
-- Requer a extensão `vector` (pgvector). Dimensão padronizada em 1024
-- (Voyage-3 e OpenAI text-embedding-3-small com dimensions=1024).
-- Doc: docs/ia-base-conhecimento.md
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ia_chunks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fonte      text        NOT NULL,        -- cms|servicos|noticias|secretarias|documentos|conhecimento
  ref_id     text        NOT NULL,        -- id da entidade de origem
  chunk_idx  int         NOT NULL DEFAULT 0,
  titulo     text,
  url        text,
  trecho     text        NOT NULL,
  modelo     text,                        -- modelo de embedding usado (auditoria/reindex)
  embedding  vector(1024) NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fonte, ref_id, chunk_idx)
);

COMMENT ON TABLE ia_chunks IS 'Corpus vetorial do RAG semântico (camada 4), por tenant. Chunks de todas as fontes do portal + embeddings. Reindexável.';

-- Índice ANN por similaridade de cosseno (HNSW — pgvector >= 0.5).
CREATE INDEX IF NOT EXISTS idx_ia_chunks_embedding
  ON ia_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_ia_chunks_tenant ON ia_chunks (tenant_id, fonte);

SELECT app_enable_tenant_rls('ia_chunks');
