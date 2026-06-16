-- =====================================================================
-- 009 — Privacidade dos chamados (DPIA: docs/07-dpia.md)
-- =====================================================================
-- Campos de privacy-by-design para denúncias georreferenciadas:
--   - anonimo: denúncia sem vínculo de identidade (mesmo com login).
--   - flags de anonimização/expurgo e carimbo de desvinculação.
-- O job/rotina de expurgo usa o índice por (tenant, status, resolvido_em).
-- =====================================================================

ALTER TABLE chamados
  ADD COLUMN IF NOT EXISTS anonimo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_anonimizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descricao_anonimizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fotos_expurgadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identidade_desvinculada_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_chamados_expurgo
  ON chamados (tenant_id, status, resolvido_em);
