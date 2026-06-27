-- =====================================================================
-- 089 — Origem do documento de Transparência (rastreabilidade + idempotência)
-- =====================================================================
-- Os anexos das cargas APLIC (inteiro teor de contratos, editais de licitação)
-- passam a ser publicados em transp_documentos. Marcamos a origem para distinguir
-- do cadastro manual e permitir reimportar sem duplicar (a ingestão substitui só
-- os documentos de origem APLIC do mesmo registro). Conta no PNTP (9.2/8.2).
-- =====================================================================

ALTER TABLE transp_documentos ADD COLUMN IF NOT EXISTS fonte_origem text;

COMMENT ON COLUMN transp_documentos.fonte_origem IS
  'Origem do documento (ex.: APLIC/TCE-MT). NULL = cadastro manual.';

CREATE INDEX IF NOT EXISTS transp_documentos_fonte_idx
  ON transp_documentos (tenant_id, fonte_origem, categoria);
