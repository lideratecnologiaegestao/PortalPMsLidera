-- =====================================================================
-- 085 — Campos Telegram em user_contatos
-- =====================================================================
-- Adiciona suporte a Telegram como canal de notificação e atendimento
-- para funcionários (atendentes, ouvidores, gestores). Espelha com
-- fidelidade a estrutura de verificação já existente para WhatsApp.
--
-- LGPD:
--   telegram_chat_id é dado de contato do servidor público (pessoa física
--   vinculada à entidade). Base legal: interesse legítimo / relação de
--   trabalho (LGPD art. 7, II e IX). Não contém PII de cidadão; o bot
--   Telegram usa chat_id interno e nunca expõe nome/número do cidadão.
--   O campo fica sujeito à mesma política de minimização e eventual
--   solicitação de exclusão pelo titular (art. 18).
--
-- RLS: a tabela já possui Row Level Security habilitada via
--   app_enable_tenant_rls('user_contatos') (migration 022).
--   NÃO se altera nenhuma policy — as novas colunas herdam o isolamento
--   existente automaticamente.
--
-- GRANTs: herdados da tabela; colunas novas não requerem GRANT extra.
--
-- Idempotência: todos os ADD COLUMN usam IF NOT EXISTS; o índice usa
--   CREATE INDEX IF NOT EXISTS. Seguro para re-execução.
-- =====================================================================

ALTER TABLE user_contatos
  ADD COLUMN IF NOT EXISTS telegram_chat_id    text,
  ADD COLUMN IF NOT EXISTS telegram_verificado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_codigo     text,
  ADD COLUMN IF NOT EXISTS telegram_codigo_exp timestamptz,
  ADD COLUMN IF NOT EXISTS notif_telegram      boolean NOT NULL DEFAULT true;

-- Índice parcial para lookup O(log n) na identificação do agente inbound.
-- Só indexa linhas verificadas, mantendo o índice pequeno e seletivo.
CREATE INDEX IF NOT EXISTS idx_user_contatos_telegram
  ON user_contatos (telegram_chat_id)
  WHERE telegram_verificado = true;

-- =====================================================================
-- VERIFICAÇÃO (descomente e execute manualmente para confirmar)
-- =====================================================================
-- \d user_contatos
--
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_name = 'user_contatos'
--   AND  column_name LIKE 'telegram%' OR column_name = 'notif_telegram'
-- ORDER  BY ordinal_position;
--
-- SELECT indexname, indexdef
-- FROM   pg_indexes
-- WHERE  tablename = 'user_contatos'
--   AND  indexname  = 'idx_user_contatos_telegram';
-- =====================================================================
