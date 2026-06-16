-- 029_licitacoes.sql
-- Cadastro de Licitações / Processos Licitatórios (Fase 2 do Cadastro de
-- Documentos). Entidade relacional: cada licitação tem modalidade + critério de
-- julgamento (taxonomias do TCE-MT) e MUITOS documentos por fase (Edital, Ata,
-- Resultado, Homologação, ARP, Contrato…), cada documento com contador de
-- downloads. Tudo com RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Modalidades (seed modalidade_licitacao.json, 70) ─────────────────────────
CREATE TABLE IF NOT EXISTS licitacao_modalidades (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo     text,
  nome       text    NOT NULL,
  slug       citext  NOT NULL,
  lei_8666   boolean NOT NULL DEFAULT false,
  lei_14133  boolean NOT NULL DEFAULT false,
  ordem      integer NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('licitacao_modalidades');

-- ── Critérios de julgamento (seed criterio_julgamento_licitacao.json, 12) ────
CREATE TABLE IF NOT EXISTS licitacao_criterios (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo     text,
  nome       text    NOT NULL,
  slug       citext  NOT NULL,
  ordem      integer NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('licitacao_criterios');

-- ── Licitações ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licitacoes (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modalidade_id  uuid           REFERENCES licitacao_modalidades(id) ON DELETE SET NULL,
  criterio_id    uuid           REFERENCES licitacao_criterios(id) ON DELETE SET NULL,
  numero         text,
  ano            integer,
  slug           citext         NOT NULL,
  objeto         text           NOT NULL,
  situacao       text,                       -- aberta|homologada|deserta|revogada|fracassada…
  orgao          text,
  data_abertura  timestamptz,
  valor_estimado numeric(15,2),
  ativo          boolean        NOT NULL DEFAULT true,
  criado_em      timestamptz    NOT NULL DEFAULT now(),
  atualizado_em  timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_licitacoes_tenant ON licitacoes (tenant_id, ano DESC, criado_em DESC);
SELECT app_enable_tenant_rls('licitacoes');

-- ── Documentos da licitação (por fase) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS licitacao_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  licitacao_id  uuid        NOT NULL REFERENCES licitacoes(id) ON DELETE CASCADE,
  fase          text        NOT NULL,        -- Edital, Ata, Resultado, Homologação, ARP, Contrato…
  titulo        text        NOT NULL,
  arquivo_url   text,
  storage_key   text,
  downloads     integer     NOT NULL DEFAULT 0,   -- ← contador
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lic_docs ON licitacao_documentos (tenant_id, licitacao_id, ordem);
SELECT app_enable_tenant_rls('licitacao_documentos');
