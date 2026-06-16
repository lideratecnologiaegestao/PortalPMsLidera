-- 032_contratos.sql
-- Cadastro de Contratos e Aditivos (dimensão própria do PNTP). Cada contrato
-- pode vincular-se à licitação de origem e ter ADITIVOS (prazo/valor), com
-- contador de downloads no contrato e em cada aditivo. RLS por tenant.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS contratos (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  licitacao_id    uuid           REFERENCES licitacoes(id) ON DELETE SET NULL,
  numero          text,
  ano             integer,
  slug            citext         NOT NULL,
  objeto          text           NOT NULL,
  contratado      text,                       -- razão social / nome
  contratado_doc  text,                       -- CNPJ/CPF
  valor           numeric(15,2),
  data_assinatura date,
  vigencia_inicio date,
  vigencia_fim    date,
  situacao        text,                       -- vigente|encerrado|rescindido|suspenso
  orgao           text,
  fundamento      text,                       -- modalidade/dispensa/lei
  arquivo_url     text,
  storage_key     text,
  downloads       integer        NOT NULL DEFAULT 0,
  ativo           boolean        NOT NULL DEFAULT true,
  criado_em       timestamptz    NOT NULL DEFAULT now(),
  atualizado_em   timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_contratos_tenant ON contratos (tenant_id, ano DESC);
SELECT app_enable_tenant_rls('contratos');

CREATE TABLE IF NOT EXISTS contrato_aditivos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contrato_id  uuid        NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  numero       text,
  tipo         text,                          -- prazo|valor|prazo e valor|reajuste|apostilamento
  objeto       text,
  valor        numeric(15,2),
  data         date,
  vigencia_fim date,
  arquivo_url  text,
  storage_key  text,
  downloads    integer     NOT NULL DEFAULT 0,
  ordem        integer     NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contrato_aditivos ON contrato_aditivos (tenant_id, contrato_id, ordem);
SELECT app_enable_tenant_rls('contrato_aditivos');
