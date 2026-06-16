-- 031_concursos.sql
-- Cadastro de Concursos e Processos Seletivos (Fase 4 do Cadastro de
-- Documentos). Cada concurso tem um tipo de certame (taxonomia TCE-MT, 6) e
-- DOCUMENTOS organizados por SITUAÇÃO/FASE (taxonomia concurso_tipo_documento,
-- 40, com flag de publicação obrigatória). Cada documento conta downloads.
-- Tudo com RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Tipos de certame (seed tipo_concurso.json, 6) ────────────────────────────
CREATE TABLE IF NOT EXISTS concurso_tipos (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo    text,
  nome      text    NOT NULL,
  slug      citext  NOT NULL,
  ordem     integer NOT NULL DEFAULT 0,
  ativo     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('concurso_tipos');

-- ── Tipos de documento do certame (seed concurso_tipo_documento.json, 40) ────
-- Chave por código (há slugs repetidos no seed). `situacao` = fase de agrupamento.
CREATE TABLE IF NOT EXISTS concurso_doc_tipos (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo      text    NOT NULL,
  nome        text    NOT NULL,
  slug        text,
  situacao    text,                 -- "1 - Abertura", "3 – Homologação…", etc.
  obrigatorio boolean NOT NULL DEFAULT false,
  ordem       integer NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, codigo)
);
SELECT app_enable_tenant_rls('concurso_doc_tipos');

-- ── Concursos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concursos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo_id       uuid        REFERENCES concurso_tipos(id) ON DELETE SET NULL,
  numero        text,
  ano           integer,
  slug          citext      NOT NULL,
  objeto        text        NOT NULL,        -- cargos/áreas (ex.: "Professores e ACS")
  situacao      text,                        -- aberto|em andamento|homologado|encerrado…
  orgao         text,
  banca         text,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_concursos_tenant ON concursos (tenant_id, ano DESC);
SELECT app_enable_tenant_rls('concursos');

-- ── Documentos do concurso (por fase) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concurso_documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  concurso_id    uuid        NOT NULL REFERENCES concursos(id) ON DELETE CASCADE,
  doc_tipo_id    uuid        REFERENCES concurso_doc_tipos(id) ON DELETE SET NULL,
  fase           text        NOT NULL,        -- situação/fase (agrupamento)
  titulo         text        NOT NULL,
  data_documento date,
  arquivo_url    text,
  storage_key    text,
  downloads      integer     NOT NULL DEFAULT 0,   -- ← contador
  ordem          integer     NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concurso_docs ON concurso_documentos (tenant_id, concurso_id, ordem);
SELECT app_enable_tenant_rls('concurso_documentos');
