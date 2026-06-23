-- =====================================================================
-- 083 — Canais Messenger (Facebook) e Telegram no omnichannel
-- =====================================================================
-- Expande os tipos de canal (migrations 081/082) para além de WhatsApp/Instagram:
--  - 'messenger' → Facebook Messenger (mesma Graph API da Meta usada no Instagram;
--     reusa meta_phone_number_id = Page ID, meta_token = Page Access Token).
--  - 'telegram'  → Telegram Bot API (reusa meta_token_cifrado = bot token do BotFather,
--     meta_verify_token = secret_token do webhook (X-Telegram-Bot-Api-Secret-Token),
--     webhook_secret = segredo no path).
-- Sem novas colunas: os campos cifrados existentes acomodam as credenciais.
-- =====================================================================

-- Tipo do canal: whatsapp | instagram | messenger | telegram
ALTER TABLE tenant_whatsapp_canais DROP CONSTRAINT IF EXISTS twc_tipo_chk;
ALTER TABLE tenant_whatsapp_canais
  ADD CONSTRAINT twc_tipo_chk CHECK (tipo IN ('whatsapp', 'instagram', 'messenger', 'telegram'));

-- O provider antigo (CHECK só 'meta') não faz sentido para Telegram — relaxa a checagem,
-- pois o roteamento usa a coluna `tipo`, não `provider`.
ALTER TABLE tenant_whatsapp_canais DROP CONSTRAINT IF EXISTS twc_provider_chk;

-- Canal da conversa: widget | whatsapp | instagram | messenger | telegram
ALTER TABLE atendimento_conversas DROP CONSTRAINT IF EXISTS atendimento_conversas_canal_check;
ALTER TABLE atendimento_conversas
  ADD CONSTRAINT atendimento_conversas_canal_check
  CHECK (canal IN ('widget', 'whatsapp', 'instagram', 'messenger', 'telegram'));

-- Para canais Telegram, meta_phone_number_id não se aplica (o Telegram usa só bot token).
-- Tornamos o campo anulável para acomodar este caso sem colunas extras.
ALTER TABLE tenant_whatsapp_canais
  ALTER COLUMN meta_phone_number_id DROP NOT NULL;
