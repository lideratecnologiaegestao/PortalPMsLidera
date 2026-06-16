-- =====================================================================
-- 007 — Transparência ativa (LC 131/2009 + LRF) e dados abertos
-- =====================================================================
-- Modelo canônico `transp_*` alimentado pelo ETL (n8n) a partir do sistema
-- contábil de cada prefeitura. Todas as tabelas têm tenant_id + RLS + índices
-- por período. A CHAVE NATURAL (UNIQUE) garante idempotência: reprocessar uma
-- carga faz UPSERT, nunca duplica.
--
-- LGPD: `transp_folha` contém dado pessoal de servidor. Publica-se cargo e
-- remuneração (jurisprudência STF), com minimização — sem CPF, sem endereço.
-- =====================================================================

-- ---------------------------------------------------------- Despesas
CREATE TABLE transp_despesas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio        int  NOT NULL,                 -- ano
  empenho          text NOT NULL,                 -- nº do empenho (chave natural)
  orgao            text,
  unidade          text,
  funcao           text,
  elemento         text,                          -- elemento de despesa
  modalidade       text,                          -- modalidade de licitação/aplicação
  credor_nome      text,
  credor_doc       text,                          -- CNPJ/CPF do credor (empresa em geral)
  fase             text,                          -- empenho | liquidacao | pagamento
  valor_empenhado  numeric(15,2) NOT NULL DEFAULT 0,
  valor_liquidado  numeric(15,2) NOT NULL DEFAULT 0,
  valor_pago       numeric(15,2) NOT NULL DEFAULT 0,
  data_empenho     date,
  fonte_origem     text,                          -- sistema contábil de origem
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, empenho)
);
CREATE INDEX idx_transp_desp_exerc ON transp_despesas (tenant_id, exercicio);
CREATE INDEX idx_transp_desp_orgao ON transp_despesas (tenant_id, orgao);
SELECT app_enable_tenant_rls('transp_despesas');

-- ---------------------------------------------------------- Receitas
CREATE TABLE transp_receitas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio         int  NOT NULL,
  codigo            text NOT NULL,                -- código da receita (chave natural)
  descricao         text,
  categoria         text,                         -- corrente | capital
  fonte             text,
  valor_previsto    numeric(15,2) NOT NULL DEFAULT 0,
  valor_arrecadado  numeric(15,2) NOT NULL DEFAULT 0,
  data_lancamento   date NOT NULL DEFAULT now(),
  fonte_origem      text,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, codigo, data_lancamento)
);
CREATE INDEX idx_transp_rec_exerc ON transp_receitas (tenant_id, exercicio);
SELECT app_enable_tenant_rls('transp_receitas');

-- ---------------------------------------------------------- Licitações
CREATE TABLE transp_licitacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio       int  NOT NULL,
  numero          text NOT NULL,                  -- nº do processo (chave natural)
  modalidade      text,
  objeto          text,
  valor_estimado  numeric(15,2),
  situacao        text,
  data_abertura   date,
  edital_url      text,
  fonte_origem    text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, numero)
);
CREATE INDEX idx_transp_lic_exerc ON transp_licitacoes (tenant_id, exercicio);
SELECT app_enable_tenant_rls('transp_licitacoes');

-- ---------------------------------------------------------- Contratos
CREATE TABLE transp_contratos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio        int,
  numero           text NOT NULL,                 -- nº do contrato (chave natural)
  fornecedor_nome  text,
  fornecedor_doc   text,
  objeto           text,
  valor            numeric(15,2),
  vigencia_inicio  date,
  vigencia_fim     date,
  fonte_origem     text,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX idx_transp_contr_exerc ON transp_contratos (tenant_id, exercicio);
SELECT app_enable_tenant_rls('transp_contratos');

-- ---------------------------------------------------------- Folha (LGPD)
CREATE TABLE transp_folha (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exercicio           int  NOT NULL,
  mes                 int  NOT NULL,              -- 1..12
  matricula           text NOT NULL,              -- chave natural (pseudônimo do servidor)
  nome_servidor       text,                       -- publicável (jurisprudência)
  cargo               text,
  vinculo             text,                       -- efetivo | comissionado | etc.
  orgao               text,
  remuneracao_bruta   numeric(15,2) NOT NULL DEFAULT 0,
  descontos           numeric(15,2) NOT NULL DEFAULT 0,
  remuneracao_liquida numeric(15,2) NOT NULL DEFAULT 0,
  fonte_origem        text,
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exercicio, mes, matricula)
);
CREATE INDEX idx_transp_folha_exerc ON transp_folha (tenant_id, exercicio, mes);
SELECT app_enable_tenant_rls('transp_folha');

-- ------------------------------------------------- Log de sincronização
-- Rastreabilidade e cálculo da DEFASAGEM (data da última atualização por
-- conjunto), exibida no portal conforme LC 131.
CREATE TABLE transp_sync_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset     text NOT NULL,                      -- despesas | receitas | ...
  origem      text,                               -- sistema contábil
  registros   int  NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'ok',         -- ok | erro
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transp_sync ON transp_sync_log (tenant_id, dataset, criado_em DESC);
SELECT app_enable_tenant_rls('transp_sync_log');
