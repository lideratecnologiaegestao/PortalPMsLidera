-- =====================================================================
-- 027 — Central de notificações in-app (por usuário)
-- =====================================================================
-- Inbox persistente de avisos do usuário (cidadão e interno): a cada evento de
-- tramitação, o NotificacoesService grava um aviso aqui (além de WhatsApp/e-mail/
-- push). O app e o portal listam por usuário. LGPD: sem teor — só ação,
-- protocolo e link. RLS por tenant + visibilidade pelo próprio user_id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notificacoes_usuario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evento          text NOT NULL,
  titulo          text NOT NULL,
  corpo           text,
  protocolo       text,
  manifestacao_id uuid REFERENCES manifestacoes(id) ON DELETE SET NULL,
  lida            boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notificacoes_usuario (tenant_id, user_id, criado_em DESC);
SELECT app_enable_tenant_rls('notificacoes_usuario');
