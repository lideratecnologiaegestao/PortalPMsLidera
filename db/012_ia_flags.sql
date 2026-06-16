-- =====================================================================
-- 012 — Feature flags de IA por tenant (DPIA docs/07-dpia.md)
-- =====================================================================
-- A IA NÃO pode ser ativada automaticamente em uma prefeitura: o gestor
-- precisa habilitar (e dar ciência/aviso ao cidadão). Padrão = desabilitado.
-- Antes de qualquer chamada externa (Anthropic), o IaService checa estas flags.
-- =====================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ia_triagem_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_chat_habilitada    boolean NOT NULL DEFAULT false;
