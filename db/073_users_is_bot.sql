-- migration 073: adiciona is_bot ao users para identificar o Assistente do Portal
-- O RLS já existe em users (policies por tenant_id) — não mexer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_bot IS
  'true = conta virtual do bot (Assistente do Portal, etc.). Nunca autentica; nunca aparece em gestão de usuários reais.';
