-- 030_conselhos.sql
-- Cadastro de Conselhos Municipais (Fase 3 do Cadastro de Documentos). Cada
-- conselho tem um tipo (taxonomia TCE-MT, 41), MEMBROS (com papel) e DOCUMENTOS
-- (atas, lei de criação, regimento…), cada documento com contador de downloads.
-- Tudo com RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Tipos de conselho (seed tipo_conselho_municipal.json, 41) ────────────────
CREATE TABLE IF NOT EXISTS conselho_tipos (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo      text,
  nome        text    NOT NULL,
  slug        citext  NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT false,
  ordem       integer NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('conselho_tipos');

-- ── Conselhos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conselhos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo_id        uuid        REFERENCES conselho_tipos(id) ON DELETE SET NULL,
  nome           text        NOT NULL,
  slug           citext      NOT NULL,
  sigla          text,
  descricao      text,
  lei_criacao    text,
  mandato_inicio date,
  mandato_fim    date,
  email          text,
  ativo          boolean     NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_conselhos_tenant ON conselhos (tenant_id, ativo);
SELECT app_enable_tenant_rls('conselhos');

-- ── Membros do conselho ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conselho_membros (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conselho_id uuid        NOT NULL REFERENCES conselhos(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  papel       text        NOT NULL,         -- Presidente, Membro Representante, Membro Designado
  segmento    text,                         -- representação (Governo, Sociedade Civil, órgão…)
  inicio      date,
  fim         date,
  ordem       integer     NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conselho_membros ON conselho_membros (tenant_id, conselho_id, ordem);
SELECT app_enable_tenant_rls('conselho_membros');

-- ── Documentos do conselho (atas, lei de criação, regimento…) ────────────────
CREATE TABLE IF NOT EXISTS conselho_documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conselho_id    uuid        NOT NULL REFERENCES conselhos(id) ON DELETE CASCADE,
  categoria      text        NOT NULL,       -- Ata de Reunião, Lei de Criação, Regimento…
  titulo         text        NOT NULL,
  data_documento date,
  arquivo_url    text,
  storage_key    text,
  downloads      integer     NOT NULL DEFAULT 0,   -- ← contador
  ordem          integer     NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conselho_docs ON conselho_documentos (tenant_id, conselho_id, ordem);
SELECT app_enable_tenant_rls('conselho_documentos');
