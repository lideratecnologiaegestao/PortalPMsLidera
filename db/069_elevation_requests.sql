-- =====================================================================
-- 069 — ADR-0005 Fase 2 — Solicitações de elevação de papel
--       (elevation_requests)
-- =====================================================================
--
-- CONTEXTO
-- --------
-- Um servidor ou cidadão pode solicitar a elevação do seu papel (role)
-- dentro do tenant sem intervenção manual do admin. Esta tabela registra
-- o ciclo de vida completo da solicitação: pendente → aprovada/recusada/
-- expirada.
--
-- GATE DE APROVAÇÃO (regra de negócio — aplicada na camada de app):
--   • papéis 'ouvidor', 'assistente_ouvidoria', 'ti'
--       → SOMENTE super_admin pode aprovar.
--         Esses papéis têm acesso sensível (dados de manifestações,
--         configurações técnicas) e requerem aprovação de plataforma.
--   • papéis 'gestor', 'servidor'
--       → admin_prefeitura do mesmo tenant pode aprovar.
--
-- A migration cria a tabela e aplica o RLS padrão de tenant via
-- app_enable_tenant_rls(). O filtro adicional por user_id (solicitante
-- enxergar apenas a própria solicitação) e por role (admin enxergar
-- solicitações do tenant) é feito na camada de aplicação (NestJS), não
-- em policies adicionais de RLS — evitando proliferação de policies e
-- mantendo a semântica simples: "quem pertence ao tenant enxerga os dados
-- do tenant; o app filtra o que cada papel pode ver dentro disso."
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / IF EXISTS para que
-- re-executar a migration não cause erro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela: elevation_requests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevation_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  papel_solicitado      user_role   NOT NULL,
  cargo_declarado       text,
  lotacao_secretaria_id uuid        REFERENCES secretarias(id)          ON DELETE SET NULL,
  justificativa         text,
  -- Status válidos: pendente → aprovada | recusada | expirada
  status                text        NOT NULL DEFAULT 'pendente'
                          CONSTRAINT ck_elevation_status
                          CHECK (status IN ('pendente','aprovada','recusada','expirada')),
  aprovado_por          uuid        REFERENCES users(id)                ON DELETE SET NULL,
  aprovado_em           timestamptz,
  motivo_recusa         text,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- Filtro frequente: listar pendentes por tenant (painel do admin/super_admin).
CREATE INDEX IF NOT EXISTS idx_elevation_tenant_status
  ON elevation_requests (tenant_id, status);

-- Filtro frequente: o usuário consulta suas próprias solicitações.
CREATE INDEX IF NOT EXISTS idx_elevation_user_id
  ON elevation_requests (user_id);

-- Unicidade parcial: impede múltiplas solicitações PENDENTES para o mesmo
-- papel pelo mesmo usuário. Aprovadas/recusadas/expiradas não são afetadas
-- — o usuário pode reabrir após resolução.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_elevation_pending_unique
  ON elevation_requests (user_id, papel_solicitado)
  WHERE status = 'pendente';

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
-- A macro app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON … USING/WITH CHECK
--     (app_is_platform() OR tenant_id = app_current_tenant());
--
-- Isso garante:
--   • super_admin em modo plataforma (app_is_platform() = true) enxerga
--     todas as solicitações de todos os tenants.
--   • Sessões de tenant enxergam apenas as solicitações do próprio tenant.
--   • Sessões sem tenant_id definido (app_current_tenant() = NULL) não
--     enxergam nada.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('elevation_requests');

-- =====================================================================
-- TRIGGER: atualiza atualizado_em automaticamente
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_elevation_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_elevation_atualizado_em ON elevation_requests;
CREATE TRIGGER tg_elevation_atualizado_em
  BEFORE UPDATE ON elevation_requests
  FOR EACH ROW EXECUTE FUNCTION trg_elevation_atualizado_em();

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO
-- Executar em sessão de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_USER_A>, <UUID_USER_B>
-- pelos UUIDs reais do ambiente de teste.
-- NÃO executar em produção com dados reais.
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: dois usuários em tenants distintos (use o psql interativo)
-- -----------------------------------------------------------------------

-- Tenant A = exemplolandia; Tenant B = outro tenant existente

-- Insere uma solicitação para o Tenant A (simula chamada da API com tenant_id correto)
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',           true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'servidor',      true);
  PERFORM set_config('app.current_user_id',   '<UUID_USER_A>', true);
END $$;

INSERT INTO elevation_requests
  (tenant_id, user_id, papel_solicitado, cargo_declarado, justificativa)
VALUES
  ('<UUID_TENANT_A>', '<UUID_USER_A>', 'ouvidor',
   'Assistente Administrativo', 'Assumi as funções de ouvidoria em substituição ao titular.');

-- -----------------------------------------------------------------------
-- TESTE 1: servidor do Tenant A vê a própria solicitação (espera 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'servidor',        true);
END $$;

SELECT count(*) AS deve_ser_1 FROM elevation_requests;

-- -----------------------------------------------------------------------
-- TESTE 2: sessão do Tenant B NÃO vê solicitação do Tenant A (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
  PERFORM set_config('app.current_user_role', 'admin_prefeitura', true);
END $$;

SELECT count(*) AS deve_ser_0_tenant_b FROM elevation_requests;

-- -----------------------------------------------------------------------
-- TESTE 3: super_admin em modo plataforma vê tudo (espera >= 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS total_plataforma FROM elevation_requests;

-- -----------------------------------------------------------------------
-- TESTE 4: índice único parcial — segunda solicitação PENDENTE do mesmo
--           usuário para o mesmo papel deve falhar com unique_violation.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

-- Este INSERT deve lançar erro (23505 unique_violation):
INSERT INTO elevation_requests
  (tenant_id, user_id, papel_solicitado, cargo_declarado, justificativa)
VALUES
  ('<UUID_TENANT_A>', '<UUID_USER_A>', 'ouvidor',
   'Tentativa duplicada', 'Deve falhar por uidx_elevation_pending_unique.');

-- -----------------------------------------------------------------------
-- TESTE 5: após resolução (status != 'pendente'), nova solicitação pendente
--           para o mesmo papel deve ser permitida.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE elevation_requests
SET status = 'recusada', motivo_recusa = 'Documentação insuficiente.'
WHERE user_id = '<UUID_USER_A>' AND papel_solicitado = 'ouvidor' AND status = 'pendente';

DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

-- Agora deve ter sucesso (não há mais pendente para esse par user+papel):
INSERT INTO elevation_requests
  (tenant_id, user_id, papel_solicitado, cargo_declarado, justificativa)
VALUES
  ('<UUID_TENANT_A>', '<UUID_USER_A>', 'ouvidor',
   'Assistente Administrativo', 'Reenvio após correção de documentação.');

SELECT count(*) AS deve_ser_1_nova_pendente
  FROM elevation_requests
 WHERE user_id = '<UUID_USER_A>' AND status = 'pendente';

-- -----------------------------------------------------------------------
-- TESTE 6: sessão sem tenant definido (app_current_tenant() = NULL)
--           não enxerga nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM elevation_requests;

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM elevation_requests WHERE user_id = '<UUID_USER_A>';

*/
