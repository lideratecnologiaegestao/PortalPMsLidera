-- 033_convenios.sql
-- Cadastro de Convênios e Transferências (dimensão própria do PNTP). Cada
-- convênio tem partes (concedente/convenente), valores (repasse/contrapartida),
-- vigência e DOCUMENTOS (termo, plano de trabalho, prestação de contas,
-- aditivos), cada documento com contador de downloads. RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS convenios (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero          text,
  ano             integer,
  slug            citext         NOT NULL,
  objeto          text           NOT NULL,
  concedente      text,                       -- quem concede o recurso
  convenente      text,                       -- quem recebe / parceiro
  valor_repasse   numeric(15,2),
  contrapartida   numeric(15,2),
  data_assinatura date,
  vigencia_inicio date,
  vigencia_fim    date,
  situacao        text,                       -- vigente|encerrado|prestacao_contas|…
  orgao           text,
  ativo           boolean        NOT NULL DEFAULT true,
  criado_em       timestamptz    NOT NULL DEFAULT now(),
  atualizado_em   timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_convenios_tenant ON convenios (tenant_id, ano DESC);
SELECT app_enable_tenant_rls('convenios');

CREATE TABLE IF NOT EXISTS convenio_documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  convenio_id    uuid        NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  categoria      text        NOT NULL,        -- Termo de Convênio, Plano de Trabalho, Prestação de Contas…
  titulo         text        NOT NULL,
  data_documento date,
  arquivo_url    text,
  storage_key    text,
  downloads      integer     NOT NULL DEFAULT 0,
  ordem          integer     NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_convenio_docs ON convenio_documentos (tenant_id, convenio_id, ordem);
SELECT app_enable_tenant_rls('convenio_documentos');
