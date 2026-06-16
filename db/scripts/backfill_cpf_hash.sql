-- =====================================================================
-- ONE-SHOT (não é migration de schema) — backfill de cpf_hash
-- =====================================================================
-- Migra os CPFs já gravados em claro para o HMAC, ANTES de aplicar a
-- migration 010 (que remove a coluna `cpf`). Roda UMA vez por banco, com o
-- MESMO pepper usado pela aplicação (CPF_PEPPER):
--
--   psql "$DATABASE_URL" -v pepper="$env:CPF_PEPPER" -f db/scripts/backfill_cpf_hash.sql
--
-- Compatível com o hash do backend (api/.../cpf-hash.ts):
--   HMAC-SHA-256(pepper, somente_dígitos(cpf)) em hexadecimal.
-- pgcrypto.hmac(data, key, type) == Node createHmac(type, key).update(data).
-- =====================================================================

UPDATE users
  SET cpf_hash = encode(
        hmac(regexp_replace(cpf, '\D', '', 'g'), :'pepper', 'sha256'),
        'hex')
  WHERE cpf IS NOT NULL
    AND cpf <> ''
    AND cpf_hash IS NULL;
