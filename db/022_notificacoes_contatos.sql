-- =====================================================================
-- 022 — Notificações multicanal + cadastro/verificação de contatos
-- =====================================================================
-- Cada usuário (cidadão logado e interno) cadastra WhatsApp e e-mail com
-- VERIFICAÇÃO (código único) e preferências (opt-in por canal). O sistema
-- notifica "quem deve agir" a cada tramitação, com link para entrar e responder.
-- LGPD: o conteúdo da notificação nunca traz o teor — só protocolo + ação + link.
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_contatos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp            text,
  whatsapp_verificado boolean NOT NULL DEFAULT false,
  whatsapp_codigo     text,                  -- hash do código de verificação
  whatsapp_codigo_exp timestamptz,
  email               text,
  email_verificado    boolean NOT NULL DEFAULT false,
  email_codigo        text,
  email_codigo_exp    timestamptz,
  notif_whatsapp      boolean NOT NULL DEFAULT true,
  notif_email         boolean NOT NULL DEFAULT true,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
SELECT app_enable_tenant_rls('user_contatos');

-- Log de cada notificação enviada (auditoria, reenvio, métricas de entrega).
CREATE TABLE IF NOT EXISTS notificacao_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifestacao_id uuid REFERENCES manifestacoes(id) ON DELETE SET NULL,
  evento          text NOT NULL,          -- nova_manifestacao | atribuicao | ...
  canal           text NOT NULL,          -- whatsapp | email
  destinatario    text,                   -- userId / contato mascarado
  status          text NOT NULL,          -- enviado | falha | ignorado
  provedor_id     text,                   -- id da mensagem no provedor
  erro            text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_log ON notificacao_log (tenant_id, criado_em);
SELECT app_enable_tenant_rls('notificacao_log');
