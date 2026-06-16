-- =====================================================================
-- 042 — Config do site por tenant: SEO/Analytics + Modo Manutenção
-- =====================================================================
-- Estende home_config (1 linha por tenant) com:
--  - google_analytics_id  : ID GA4 (G-XXXX) para gtag; vazio = sem analytics
--  - og_image_url         : imagem padrão de Open Graph (compartilhamento)
--  - modo_manutencao      : quando true, o portal público mostra a página de
--                           manutenção (o /admin continua acessível ao gestor)
--  - manutencao_mensagem  : texto exibido na página de manutenção
-- =====================================================================

ALTER TABLE home_config
  ADD COLUMN IF NOT EXISTS google_analytics_id text,
  ADD COLUMN IF NOT EXISTS og_image_url        text,
  ADD COLUMN IF NOT EXISTS modo_manutencao     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manutencao_mensagem text;
