-- =====================================================================
-- 109 — Permissão de edição dos hinos estaduais pelo painel
-- =====================================================================
-- A base `hinos_estaduais` é GLOBAL (compartilhada entre todos os tenants).
-- Concede escrita ao portal_app para o editor de hinos do admin. A restrição
-- de quem pode editar é feita no controller (RBAC admin/super_admin).
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT INSERT, UPDATE, DELETE ON hinos_estaduais TO portal_app;
  END IF;
END$$;
