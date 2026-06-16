-- =====================================================================
-- 057 — Importação da carga contábil APLIC (TCE-MT) — módulo CT (execução da despesa)
-- =====================================================================
-- Carga = .zip por módulo/ano/competência → 1 XML (DATAPACKET) por tabela.
-- POC: núcleo da execução da despesa (credor ← empenho ← liquidação ← pagamento).
-- Idempotência:
--   - aplic_credor: UPSERT por (tenant_id, identificacao) — cadastro cumulativo.
--   - movimentos: escopo por (tenant_id, exercicio, competencia) — reimportar a
--     mesma competência SUBSTITUI (delete+insert no serviço).
-- Cada linha guarda os campos consultáveis + `dados jsonb` (a linha completa do
-- leiaute — nada se perde). Valores em numeric(16,2); datas em date.
-- Ver docs/adr/ADR-0002-importacao-aplic-tcemt.md. RLS por tenant (obrigatório).
-- =====================================================================

-- ---------- Registro de cada importação (rastreabilidade) ----------
CREATE TABLE IF NOT EXISTS aplic_carga (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modulo          text        NOT NULL,                 -- 'CT', 'FP', ...
  exercicio       integer     NOT NULL,
  competencia     text,                                 -- '01'..'12' (ou bimestre)
  arquivo_nome    text,
  status          text        NOT NULL DEFAULT 'concluida', -- processando|concluida|erro
  total_registros integer     NOT NULL DEFAULT 0,
  por_tabela      jsonb,                                -- {EMPENHO: 37, ...}
  erro            text,
  criado_por      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_carga');

-- ---------- Credores / fornecedores (CADASTRO_GERAL) ----------
-- CG_Identificacao = CPF (pessoa física → PII, mascarar no público/IA) ou CNPJ.
CREATE TABLE IF NOT EXISTS aplic_credor (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identificacao text        NOT NULL,                   -- CPF/CNPJ (CG_Identificacao)
  tipo_pessoa   text,                                   -- '1' física, '2' jurídica
  nome          text,
  municipio_cod text,
  dados         jsonb       NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aplic_credor_uk UNIQUE (tenant_id, identificacao)
);
SELECT app_enable_tenant_rls('aplic_credor');

-- ---------- Dotação orçamentária (DOTACAO) ----------
CREATE TABLE IF NOT EXISTS aplic_dotacao (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id      uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio     integer     NOT NULL,
  competencia   text,
  org_codigo    text,
  unor_codigo   text,
  dados         jsonb       NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_dotacao');
CREATE INDEX IF NOT EXISTS aplic_dotacao_escopo_idx ON aplic_dotacao (tenant_id, exercicio, competencia);

-- ---------- Empenhos (EMPENHO) ----------
CREATE TABLE IF NOT EXISTS aplic_empenho (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id        uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio       integer     NOT NULL,
  competencia     text,
  org_codigo      text,
  unor_codigo     text,
  emp_numero      text        NOT NULL,                 -- '999999/AAAA'
  emp_data        date,
  emp_valor       numeric(16,2) NOT NULL DEFAULT 0,
  credor_ident    text,                                 -- FK lógica → aplic_credor.identificacao
  fn_codigo       text,
  elemento_desp   text,                                 -- ELDE_Codigo
  descricao       text,
  dados           jsonb       NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_empenho');
CREATE INDEX IF NOT EXISTS aplic_empenho_escopo_idx ON aplic_empenho (tenant_id, exercicio, competencia);
CREATE INDEX IF NOT EXISTS aplic_empenho_credor_idx ON aplic_empenho (tenant_id, credor_ident);
CREATE INDEX IF NOT EXISTS aplic_empenho_num_idx    ON aplic_empenho (tenant_id, org_codigo, unor_codigo, emp_numero);

-- ---------- Liquidações (LIQUIDACAO_EMPENHO) ----------
CREATE TABLE IF NOT EXISTS aplic_liquidacao (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id      uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio     integer     NOT NULL,
  competencia   text,
  org_codigo    text,
  unor_codigo   text,
  emp_numero    text        NOT NULL,
  liq_numero    text        NOT NULL,
  liq_data      date,
  liq_valor     numeric(16,2) NOT NULL DEFAULT 0,
  dados         jsonb       NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_liquidacao');
CREATE INDEX IF NOT EXISTS aplic_liquidacao_escopo_idx ON aplic_liquidacao (tenant_id, exercicio, competencia);
CREATE INDEX IF NOT EXISTS aplic_liquidacao_emp_idx    ON aplic_liquidacao (tenant_id, org_codigo, unor_codigo, emp_numero);

-- ---------- Pagamentos (PAGAMENTO_EMPENHO) ----------
CREATE TABLE IF NOT EXISTS aplic_pagamento (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id      uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio     integer     NOT NULL,
  competencia   text,
  pgto_numero   text        NOT NULL,                   -- '99999999999/AAAA'
  pgto_data     date,
  pgto_valor    numeric(16,2) NOT NULL DEFAULT 0,
  dados         jsonb       NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_pagamento');
CREATE INDEX IF NOT EXISTS aplic_pagamento_escopo_idx ON aplic_pagamento (tenant_id, exercicio, competencia);
CREATE INDEX IF NOT EXISTS aplic_pagamento_num_idx    ON aplic_pagamento (tenant_id, pgto_numero);

-- ---------- Ponte pagamento↔liquidação (PAGAMENTO_EMPENHO_LIQUIDACAO) ----------
CREATE TABLE IF NOT EXISTS aplic_pagamento_liquidacao (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id      uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio     integer     NOT NULL,
  competencia   text,
  org_codigo    text,
  unor_codigo   text,
  emp_numero    text,
  liq_numero    text,
  pgto_numero   text,
  dados         jsonb       NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_pagamento_liquidacao');
CREATE INDEX IF NOT EXISTS aplic_pag_liq_escopo_idx ON aplic_pagamento_liquidacao (tenant_id, exercicio, competencia);
CREATE INDEX IF NOT EXISTS aplic_pag_liq_pgto_idx   ON aplic_pagamento_liquidacao (tenant_id, pgto_numero);
