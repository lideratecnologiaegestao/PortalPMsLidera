-- =====================================================================
-- 008 — Ajustes LGPD: hash de CPF de cidadãos + supressão de nome na folha
-- =====================================================================
-- Decisões do parecer DPO (ver docs/06-lgpd-gdpr.md):
--   - CPF do cidadão deixa de ser guardado em claro. Passa a HMAC-SHA-256 com
--     pepper de plataforma (CPF_PEPPER), permitindo deduplicação sem expor o
--     dado. A coluna `cpf` em claro será REMOVIDA numa migration posterior,
--     após migrar os registros existentes (rollout em etapas).
--   - `transp_folha.nome_suprimido`: previsto desde já (evita ALTER em tabela
--     com volume) para servidores com medida protetiva.
-- =====================================================================

-- Hash do CPF (dedupe sem dado pessoal em claro)
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_hash text;
CREATE INDEX IF NOT EXISTS idx_users_cpf_hash ON users (tenant_id, cpf_hash);

-- Supressão de nome por medida protetiva (folha)
ALTER TABLE transp_folha
  ADD COLUMN IF NOT EXISTS nome_suprimido boolean NOT NULL DEFAULT false;
