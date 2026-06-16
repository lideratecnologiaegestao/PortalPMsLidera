-- =====================================================================
-- 052 — Config de WhatsApp por tenant (adapter Z-API / Evolution / Meta)
-- =====================================================================
-- WhatsApp atrás de um adapter multi-provider, multi-tenant. Credenciais são
-- SEGREDO POR TENANT (cifradas em repouso via secret-box) — nunca em .env
-- versionado nem em log. O .env global serve só de default no dev.
-- Spec: prompts/ZAP/PROMPT-zapi-adapter.md ; docs/whatsapp-zapi/.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_whatsapp_config (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  provider                 text        NOT NULL DEFAULT 'evolution',
  fallback_provider        text,
  -- Z-API
  zapi_instance_id         text,
  zapi_token_cifrado       text,       -- cifrado (secret-box)
  zapi_client_token_cifrado text,      -- cifrado (header Client-Token)
  zapi_webhook_secret      text,       -- string aleatória usada no PATH do webhook
  -- Evolution (fallback)
  evolution_api_url        text,
  evolution_instance       text,
  evolution_api_key_cifrado text,      -- cifrado
  ativo                    boolean     NOT NULL DEFAULT true,
  atualizado_em            timestamptz NOT NULL DEFAULT now(),
  criado_em                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twa_provider_chk CHECK (provider IN ('zapi','evolution','meta')),
  CONSTRAINT twa_fallback_chk CHECK (fallback_provider IS NULL OR fallback_provider IN ('zapi','evolution','meta'))
);

COMMENT ON TABLE  tenant_whatsapp_config IS 'Configuração de WhatsApp por tenant: provider ativo + fallback + credenciais cifradas (Z-API/Evolution). Webhook protegido por zapi_webhook_secret no path.';
COMMENT ON COLUMN tenant_whatsapp_config.zapi_webhook_secret IS 'Segredo aleatório no path do webhook (/webhooks/zapi/{slug}/{secret}/...). A Z-API não assina o webhook.';

SELECT app_enable_tenant_rls('tenant_whatsapp_config');
