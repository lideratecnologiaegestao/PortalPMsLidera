-- =====================================================================
-- 026 — Cadastro/login do CIDADÃO sem gov.br (e-mail + senha + verificação)
-- =====================================================================
-- O gov.br é apenas UMA das opções de acesso. A maioria dos cidadãos se
-- cadastra direto: nome, e-mail, telefone e senha — confirmando o E-MAIL (código
-- por e-mail do tenant) e o TELEFONE (código por WhatsApp/Evolution). Mesma
-- pessoa pode ter conta em vários municípios (unicidade por tenant_id+email,
-- já existente). Tudo com RLS por tenant.
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS telefone            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verificado    boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telefone_verificado boolean NOT NULL DEFAULT false;

-- Códigos de verificação (e-mail / telefone / reset de senha). Guardamos só o
-- HASH do código; expira em minutos.
CREATE TABLE IF NOT EXISTS auth_verificacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finalidade  text NOT NULL,            -- email | telefone | reset
  codigo_hash text NOT NULL,
  expira_em   timestamptz NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_authverif ON auth_verificacoes (user_id, finalidade);
SELECT app_enable_tenant_rls('auth_verificacoes');
