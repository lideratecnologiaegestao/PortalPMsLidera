-- =====================================================================
-- 090 — APLIC Fase 5: movimentos contábeis por FONTE DE RECURSO (consulta fiscal)
-- =====================================================================
-- Para o cidadão (via chatbot) consultar com PRECISÃO, derivado do lançamento
-- contábil diário (carga CT) e agregado por dia/conta/fonte:
--   grupo='receita' (6.2.1.2) → arrecadação por período e fonte
--   grupo='ddr'     (8.2.1.1) → saldo por fonte de recurso (disponibilidade)
--   grupo='caixa'   (1.1.1.x) → saldo de caixa e equivalentes por fonte
-- Fonte = destinação de recurso DRGRP.DRESP.DESTREC (nomes em aplic-fontes.ref.ts).
-- Carga mensal: substitui a competência (idempotente). Números SEMPRE de consulta
-- determinística (regra de ouro ADR-0002 — nunca de embeddings). RLS por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS aplic_mov_contabil (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id    uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio   integer     NOT NULL,
  competencia text,
  grupo       text        NOT NULL,             -- receita | ddr | caixa
  conta       text        NOT NULL,             -- ECTCE_Codigo (PCASP/TCE)
  data        date,                             -- MCC_Data (consultas por período)
  natureza    text,                             -- ESPRC (só receita)
  drgrp       text,                             -- destinação de recurso (grupo)
  dresp       text,                             -- destinação de recurso (especificação) = "fonte"
  destrec     text,                             -- destinação de recurso (detalhe)
  debito      numeric(16,2) NOT NULL DEFAULT 0,
  credito     numeric(16,2) NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_mov_contabil');
CREATE INDEX IF NOT EXISTS aplic_mov_contabil_escopo_idx ON aplic_mov_contabil (tenant_id, exercicio, competencia);
CREATE INDEX IF NOT EXISTS aplic_mov_contabil_consulta_idx ON aplic_mov_contabil (tenant_id, grupo, data);
CREATE INDEX IF NOT EXISTS aplic_mov_contabil_fonte_idx ON aplic_mov_contabil (tenant_id, grupo, dresp);
