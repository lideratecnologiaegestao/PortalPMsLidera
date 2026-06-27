-- =====================================================================
-- 087 — APLIC Fase 2: Previsão de Receita (módulo 00/Orçamento)
-- =====================================================================
-- Licitações, Contratos e Convênios do APLIC NÃO ganham tabela própria: a
-- ingestão alimenta as tabelas de Transparência já existentes
-- (transp_licitacoes / transp_contratos / transp_convenios), reaproveitando as
-- páginas, filtros, dados abertos e a verificação PNTP. fonte_origem='APLIC/TCE-MT'.
--
-- A previsão de receita (PREVISAO_RECEITA) não tem equivalente em transp_* e é
-- guardada aqui para uso futuro (página de receita + IA fiscal). NÃO é publicada
-- ainda: o total bruto soma por fonte de recurso (DRGRP/DRESP/DESTREC) e precisa
-- da metodologia de classificação da receita p/ não exibir cifra inflada.
-- Carga ANUAL: reimportar substitui o exercício (delete+insert). RLS por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS aplic_previsao_receita (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id       uuid        REFERENCES aplic_carga(id) ON DELETE SET NULL,
  exercicio      integer     NOT NULL,
  esprc_codigo   text,                                 -- ESPRC_Codigo (espécie de receita)
  topr_codigo    text,                                 -- TOPR_Codigo (tipo de operação)
  drgrp_codigo   text,
  dresp_codigo   text,
  destrec_codigo text,
  tipo_previsao  text,                                 -- PVRC_TipoPrevisao
  mes_referencia text,                                 -- PVRC_MesReferencia
  valor          numeric(16,2) NOT NULL DEFAULT 0,     -- PVRC_Valor
  dados          jsonb       NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('aplic_previsao_receita');
CREATE INDEX IF NOT EXISTS aplic_previsao_receita_exerc_idx ON aplic_previsao_receita (tenant_id, exercicio);
