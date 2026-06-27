-- =====================================================================
-- 088 — APLIC Fase 4: Receita arrecadada (derivada da contabilidade)
-- =====================================================================
-- A receita arrecadada não vem pronta no leiaute: deriva-se do LANCAMENTO
-- CONTÁBIL DIÁRIO (carga CT), pela conta de controle orçamentário do PCASP/TCE
--   6.2.1.2  RECEITA REALIZADA   (saldo credor)  → arrecadação bruta
--   6.2.1.3  (-) DEDUÇÕES        (renúncia, redutor FPM, transferências…)
-- A natureza da receita está na CONTA-CORRENTE (tipo 78): o 1º segmento é o
-- código (ESPECIFICACAO_RECEITA.ESPRC_Codigo, mesmo formato da PREVISAO_RECEITA);
-- o nome vem do histórico do lançamento. Guardamos por (exercício, competência,
-- natureza) — carga mensal: reimportar a competência substitui. Depois agregamos
-- para `transp_receitas` (previsto × arrecadado por natureza), que já alimenta a
-- página de Receitas e o PNTP 3.1 (essencial). RLS por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS aplic_receita_arrecadada (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id        uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio       integer     NOT NULL,
  competencia     text,
  natureza_codigo text        NOT NULL,                 -- ESPRC_Codigo (1º segmento da conta-corrente)
  natureza_nome   text,                                 -- do histórico do lançamento
  valor_arrecadado numeric(16,2) NOT NULL DEFAULT 0,    -- créditos − débitos em 6.2.1.2
  valor_deducao    numeric(16,2) NOT NULL DEFAULT 0,    -- 6.2.1.3 (deduções) — informativo
  criado_em       timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_receita_arrecadada');
CREATE INDEX IF NOT EXISTS aplic_receita_arrecadada_escopo_idx
  ON aplic_receita_arrecadada (tenant_id, exercicio, competencia);
