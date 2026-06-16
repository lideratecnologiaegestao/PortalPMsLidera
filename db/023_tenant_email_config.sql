-- =====================================================================
-- 023 — Configuração de e-mail (SMTP/IMAP) POR TENANT
-- =====================================================================
-- Cada prefeitura tem seu próprio domínio e caixa de e-mail; a configuração
-- de envio é INDIVIDUAL e fica no painel da entidade (não em env global).
-- A senha do SMTP é guardada CIFRADA (AES-256-GCM, ver secret-box.util.ts).
-- RLS por tenant; só admin da prefeitura edita.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_email_config (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  smtp_host     text,
  smtp_port     int,
  smtp_secure   boolean NOT NULL DEFAULT true,   -- true = SSL (465); false = STARTTLS (587)
  smtp_user     text,
  smtp_pass     text,                            -- CIFRADA
  smtp_from     text,                            -- remetente exibido
  imap_host     text,
  imap_port     int,
  ativo         boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('tenant_email_config');
