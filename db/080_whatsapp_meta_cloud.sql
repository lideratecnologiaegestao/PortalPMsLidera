-- =====================================================================
-- 080 — Provider Meta Cloud API (WhatsApp Business Oficial) por tenant
-- =====================================================================
-- Implementa o provider OFICIAL da Meta (Graph API) no adapter de WhatsApp,
-- ao lado de Z-API/Evolution. Cada prefeitura (tenant) tem a sua própria WABA
-- (WhatsApp Business Account) e número. Credenciais cifradas em repouso.
--
-- Diferença para Z-API/Evolution: a Meta ASSINA o webhook (HMAC-SHA256 sobre o
-- corpo cru, header X-Hub-Signature-256). Mantemos também o segredo no path
-- (meta_webhook_secret) para resolver o tenant antes de validar a assinatura,
-- e o verify_token para o handshake GET de verificação do webhook.
-- Tabela já existe (migration 052) e já tem RLS; aqui só adicionamos colunas.
-- =====================================================================

ALTER TABLE tenant_whatsapp_config
  ADD COLUMN IF NOT EXISTS meta_phone_number_id    text,  -- ID do número (Graph API: /{phone_number_id}/messages)
  ADD COLUMN IF NOT EXISTS meta_waba_id            text,  -- WhatsApp Business Account ID (opcional, p/ multi-número futuro)
  ADD COLUMN IF NOT EXISTS meta_token_cifrado      text,  -- access token permanente do System User (cifrado)
  ADD COLUMN IF NOT EXISTS meta_app_secret_cifrado text,  -- App Secret (cifrado) — valida X-Hub-Signature-256
  ADD COLUMN IF NOT EXISTS meta_verify_token       text,  -- token do handshake GET (hub.verify_token)
  ADD COLUMN IF NOT EXISTS meta_webhook_secret     text;  -- segredo aleatório no path do webhook (/webhooks/meta/{slug}/{secret})

COMMENT ON COLUMN tenant_whatsapp_config.meta_phone_number_id    IS 'Meta Cloud API: ID do número de telefone (endpoint /{phone_number_id}/messages).';
COMMENT ON COLUMN tenant_whatsapp_config.meta_app_secret_cifrado IS 'App Secret cifrado — usado para validar a assinatura HMAC-SHA256 do webhook (X-Hub-Signature-256).';
COMMENT ON COLUMN tenant_whatsapp_config.meta_verify_token       IS 'Token do handshake de verificação do webhook (GET hub.verify_token).';
COMMENT ON COLUMN tenant_whatsapp_config.meta_webhook_secret     IS 'Segredo aleatório no path do webhook da Meta, para resolver o tenant antes de validar a assinatura.';
