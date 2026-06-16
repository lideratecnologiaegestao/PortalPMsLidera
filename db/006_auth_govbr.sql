-- =====================================================================
-- 006 — Identidade gov.br (Login Único / OIDC)
-- =====================================================================
-- Ajustes na tabela `users` para suportar autenticação via gov.br:
--   1. Unicidade do `govbr_sub` passa a ser POR TENANT. O mesmo cidadão
--      (mesmo `sub` gov.br) pode ter conta em várias prefeituras — assim
--      como já vale para o e-mail (UNIQUE tenant_id+email). A constraint
--      global anterior (users_govbr_sub_key) impedia isso.
--   2. Selo de confiabilidade gov.br (bronze/prata/ouro) → gating de ações
--      sensíveis (recurso ESIC, assinatura). Guardado como smallint para
--      comparação por ordem (1=bronze < 2=prata < 3=ouro).
--   3. Carimbo de último login (auditoria leve, sem dado sensível).
-- =====================================================================

-- 1. troca unicidade global por unicidade por tenant
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_govbr_sub_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_govbr_sub_key;
ALTER TABLE users
  ADD CONSTRAINT users_tenant_govbr_sub_key UNIQUE (tenant_id, govbr_sub);

-- 2. nível de confiabilidade gov.br (NULL enquanto desconhecido)
ALTER TABLE users ADD COLUMN IF NOT EXISTS govbr_nivel smallint;
COMMENT ON COLUMN users.govbr_nivel IS
  'Selo de confiabilidade gov.br: 1=bronze, 2=prata, 3=ouro';
-- garante o domínio do nível no banco (não confia só na aplicação)
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_govbr_nivel;
ALTER TABLE users ADD CONSTRAINT chk_govbr_nivel
  CHECK (govbr_nivel IS NULL OR govbr_nivel BETWEEN 1 AND 3);

-- 3. último login (gov.br ou senha)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ultimo_login_em timestamptz;

-- (RLS de `users` já está ativo desde 002 — nenhuma policy nova é necessária.)
