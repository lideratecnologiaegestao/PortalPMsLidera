-- =====================================================================
-- 024 — Tokens de push (App do Cidadão / Expo)
-- =====================================================================
-- Registro dos device tokens para notificação push. O envio (Expo Push API)
-- já é disparado pelo pipeline de notificações; só passa a entregar quando o
-- app móvel existir e registrar tokens. RLS por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  plataforma text,              -- ios | android | web
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens (tenant_id, user_id);
SELECT app_enable_tenant_rls('push_tokens');
