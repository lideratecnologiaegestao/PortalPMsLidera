-- =====================================================================
-- 041 — Serviços em destaque na home
-- =====================================================================
-- `destaque` controla quais serviços aparecem na seção "Serviços" da página
-- inicial (o gestor ativa/desativa no /admin/servicos). Independente de
-- `publicado` (que controla se o serviço aparece na Carta de Serviços).
-- =====================================================================

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_servico_destaque ON servicos (tenant_id, destaque) WHERE destaque;
