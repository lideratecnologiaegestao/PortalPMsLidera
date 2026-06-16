-- =====================================================================
-- 014 — Datasets PNTP faltantes (caminho para o selo Diamante)
-- =====================================================================
-- Cobre as dimensões pendentes da matriz PNTP/Atricon. Dois padrões:
--   1. DOCUMENTAL (transp_documentos): datasets publicados como documento/arquivo
--      — Planejamento (PPA/LDO/LOA — ESSENCIAIS), Relatórios (RGF/RREO/Balanço —
--      ESSENCIAIS), Prestação de Contas, editais, regulamento LAI, relatório
--      estatístico do SIC, Carta de Serviços, atos normativos, etc.
--   2. TABULAR: diárias, obras, dívida ativa, terceirizados, convênios.
-- Todos com tenant_id + RLS + índices por exercício (série histórica). O
-- transp_sync_log (007) já dá a "atualidade" (defasagem) a qualquer dataset.
-- =====================================================================

-- ---------------------------------------------------------- Documental
CREATE TABLE transp_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria     text NOT NULL,            -- ppa|ldo|loa|rgf|rreo|balanco_geral|
                                          -- prestacao_contas|relatorio_gestao|
                                          -- decisao_contas|julgamento_contas|
                                          -- edital_licitacao|doc_licitacao|
                                          -- dispensa_inexigibilidade|ata_srp|
                                          -- plano_contratacoes|sancionados|
                                          -- regulamento_licitacoes|contrato|aditivo|
                                          -- ordem_pagamentos|regulamento_lai|
                                          -- relatorio_estatistico_sic|sigilo|
                                          -- desclassificados|carta_servicos|
                                          -- politica_privacidade|ato_normativo|
                                          -- plano_saude|plano_educacao|...
  exercicio     int,                      -- ano (série histórica)
  periodo       text,                     -- ex.: "1º bimestre", "mai/2026"
  titulo        text NOT NULL,
  descricao     text,
  orgao         text,
  url_externa   text,                     -- link público OU
  storage_key   text,                     -- arquivo no object storage (via API)
  competencia   date,
  publicado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transp_doc ON transp_documentos (tenant_id, categoria, exercicio DESC);
CREATE INDEX idx_transp_doc_busca ON transp_documentos USING gin (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(descricao,'')));
SELECT app_enable_tenant_rls('transp_documentos');

-- ---------------------------------------------------------- Diárias
CREATE TABLE transp_diarias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio        int  NOT NULL,
  documento        text NOT NULL,         -- nº do empenho/processo (chave natural)
  beneficiario     text,
  cargo            text,
  orgao            text,
  destino          text,
  finalidade       text,
  quantidade       numeric(10,2) DEFAULT 0,
  valor_total      numeric(15,2) NOT NULL DEFAULT 0,
  data_inicio      date,
  data_fim         date,
  fonte_origem     text,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, documento)
);
CREATE INDEX idx_transp_diarias ON transp_diarias (tenant_id, exercicio);
SELECT app_enable_tenant_rls('transp_diarias');

-- ---------------------------------------------------------- Obras
CREATE TABLE transp_obras (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio        int,
  identificador    text NOT NULL,         -- chave natural (nº/código da obra)
  objeto           text,
  situacao         text,                  -- em_andamento|concluida|paralisada|...
  responsavel      text,
  contratada       text,
  endereco         text,
  bairro           text,
  valor_contratado numeric(15,2),
  valor_executado  numeric(15,2),
  valor_pago       numeric(15,2),
  data_inicio      date,
  data_prevista    date,
  motivo_paralisacao text,
  fonte_origem     text,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identificador)
);
CREATE INDEX idx_transp_obras ON transp_obras (tenant_id, situacao);
SELECT app_enable_tenant_rls('transp_obras');

-- ---------------------------------------------------------- Dívida Ativa
CREATE TABLE transp_divida_ativa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio     int NOT NULL,
  inscricao     text NOT NULL,            -- nº da inscrição (chave natural)
  inscrito_nome text,
  inscrito_doc  text,                     -- CPF/CNPJ (mascarar CPF na saída)
  natureza      text,
  valor         numeric(15,2) NOT NULL DEFAULT 0,
  fonte_origem  text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, inscricao)
);
CREATE INDEX idx_transp_divida ON transp_divida_ativa (tenant_id, exercicio);
SELECT app_enable_tenant_rls('transp_divida_ativa');

-- ---------------------------------------------------------- Terceirizados/Estagiários
CREATE TABLE transp_terceirizados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio     int NOT NULL,
  mes           int,
  vinculo       text NOT NULL DEFAULT 'terceirizado', -- terceirizado|estagiario
  registro      text NOT NULL,            -- matrícula/identificador (chave natural)
  nome          text,
  empresa       text,                     -- empresa contratada (terceirizado)
  cargo         text,
  orgao         text,
  remuneracao   numeric(15,2) DEFAULT 0,
  fonte_origem  text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, vinculo, registro)
);
CREATE INDEX idx_transp_terc ON transp_terceirizados (tenant_id, exercicio, vinculo);
SELECT app_enable_tenant_rls('transp_terceirizados');

-- ---------------------------------------------------------- Convênios/Transferências
CREATE TABLE transp_convenios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio     int NOT NULL,
  numero        text NOT NULL,            -- nº do convênio (chave natural)
  tipo          text NOT NULL DEFAULT 'recebido', -- recebido|realizado|sem_recurso
  participe     text,                     -- concedente/convenente
  objeto        text,
  valor         numeric(15,2),
  valor_repassado numeric(15,2),
  vigencia_inicio date,
  vigencia_fim  date,
  fonte_origem  text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, numero)
);
CREATE INDEX idx_transp_conv ON transp_convenios (tenant_id, exercicio, tipo);
SELECT app_enable_tenant_rls('transp_convenios');
