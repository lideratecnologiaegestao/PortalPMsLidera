-- =====================================================================
-- 010 — Remove o CPF em claro de `users` (LGPD, parecer DPO)
-- =====================================================================
-- Em produção: rodar db/scripts/backfill_cpf_hash.sql ANTES desta migration,
-- para preservar a deduplicação dos cadastros existentes. Em banco novo, a
-- coluna nunca chega a receber CPF em claro (o login já grava só cpf_hash).
-- =====================================================================

ALTER TABLE users DROP COLUMN IF EXISTS cpf;
