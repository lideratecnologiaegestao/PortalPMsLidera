-- 028_documentos.sql
-- Motor único de Cadastro de Documentos (Leis, Decretos, Portarias/Resoluções,
-- Alvarás, Documentos genérico…). Cada CADASTRO tem slug+rota+menu próprios; cada
-- TIPO é a taxonomia (semeada do TCE-MT). DOCUMENTOS guardam o vínculo com a
-- biblioteca de mídia e um CONTADOR DE DOWNLOADS. Tudo com RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Cadastros (Leis, Decretos…) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_cadastros (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug           citext      NOT NULL,
  nome           text        NOT NULL,
  descricao      text,
  icone          text,
  ordem          integer     NOT NULL DEFAULT 0,
  taxonomia_seed text,                    -- ex.: 'natureza_lei' (informativo)
  ativo          boolean     NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_doc_cadastros_tenant ON doc_cadastros (tenant_id, ativo, ordem);
SELECT app_enable_tenant_rls('doc_cadastros');

-- ── Tipos (taxonomia de cada cadastro) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_tipos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cadastro_id    uuid        NOT NULL REFERENCES doc_cadastros(id) ON DELETE CASCADE,
  codigo         text,                    -- código oficial do TCE-MT (quando houver)
  nome           text        NOT NULL,
  slug           citext      NOT NULL,
  ordem          integer     NOT NULL DEFAULT 0,
  meta           jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- flags (lei_8666/lei_14133…)
  destacar_menu  boolean     NOT NULL DEFAULT false,        -- promove o tipo a item de menu próprio
  ativo          boolean     NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cadastro_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_doc_tipos_cadastro ON doc_tipos (tenant_id, cadastro_id, ordem);
SELECT app_enable_tenant_rls('doc_tipos');

-- ── Documentos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cadastro_id    uuid        NOT NULL REFERENCES doc_cadastros(id) ON DELETE CASCADE,
  tipo_id        uuid        REFERENCES doc_tipos(id) ON DELETE SET NULL,
  numero         text,
  ano            integer,
  data_documento date,
  titulo         text        NOT NULL,
  ementa         text,
  orgao          text,
  situacao       text,                    -- vigente|revogada|… (livre por cadastro)
  slug           citext      NOT NULL,
  arquivo_url    text,                    -- /midia/... (biblioteca de mídia) ou URL externa
  storage_key    text,                    -- referência interna (nunca exposta)
  tags           text[],
  downloads      integer     NOT NULL DEFAULT 0,   -- ← CONTADOR DE DOWNLOADS
  ativo          boolean     NOT NULL DEFAULT true,
  publicado_em   timestamptz NOT NULL DEFAULT now(),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cadastro_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_documentos_cadastro ON documentos (tenant_id, cadastro_id, ano DESC, publicado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo     ON documentos (tenant_id, tipo_id);
SELECT app_enable_tenant_rls('documentos');
