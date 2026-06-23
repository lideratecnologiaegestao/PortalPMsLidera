-- =====================================================================
-- 070 — ADR-0005 Fase 3 — Registro de aceite do EULA / Termo de Sigilo
--       (eula_aceites)
-- =====================================================================
--
-- BASE LEGAL E FINALIDADE
-- -----------------------
-- Esta tabela registra o aceite formal do ouvidor/assistente_ouvidoria ao
-- Termo de Sigilo da Fonte (art. 5º, XIV, CF/88) e ao EULA da plataforma
-- (LGPD art. 46 — medidas técnicas e administrativas aptas a proteger dados
-- pessoais de acessos não autorizados).
--
-- Propósito de accountability (LGPD art. 37 — manutenção de registro das
-- operações de tratamento de dados pessoais): evidência auditável de que
-- cada ouvidor/assistente leu, compreendeu e aceitou os termos antes de
-- obter acesso às manifestações (dados pessoais e dados de fonte).
--
-- A versão do EULA aceita é gravada (campo `versao`) para que, ao publicar
-- uma nova versão do Termo, a camada de aplicação possa detectar que o
-- aceite está desatualizado e exigir novo aceite antes de liberar acesso.
--
-- UNICIDADE: (user_id, versao) — um usuário aceita cada versão do EULA
-- exatamente uma vez. Se o Termo for revisado, uma nova linha é inserida
-- com a nova versão.
--
-- RETENÇÃO: registros de aceite NÃO devem ser apagados junto ao usuário em
-- pedidos de exclusão (LGPD art. 16, I — cumprimento de obrigação legal).
-- A FK usa ON DELETE CASCADE para consistência referencial ordinária, mas o
-- processo de anonimização/exclusão de usuário na camada de aplicação deve
-- manter esta linha com user_id anonimizado (ver fluxo LGPD/art.18).
--
-- ISOLAMENTO: RLS via app_enable_tenant_rls() — ouvidor de Tenant A não
-- enxerga aceites do Tenant B. super_admin em modo plataforma vê tudo
-- (app_is_platform() = true).
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / IF EXISTS para que
-- re-executar a migration não cause erro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela: eula_aceites
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eula_aceites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  versao      text        NOT NULL,
  aceito_em   timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text,

  -- Um usuário aceita cada versão do EULA exatamente uma vez.
  -- Nova versão publicada → nova linha; a constraint não é violada.
  CONSTRAINT uq_eula_user_versao UNIQUE (user_id, versao)
);

COMMENT ON TABLE eula_aceites IS
  'Registro de aceite do EULA / Termo de Sigilo da Fonte por ouvidor e assistente_ouvidoria. '
  'Base legal: CF/88 art. 5º XIV + LGPD arts. 37 e 46. '
  'Evidência de accountability: prova que o usuário aceitou o termo antes de acessar manifestações.';

COMMENT ON COLUMN eula_aceites.versao      IS 'Identificador da versão do EULA aceita (ex.: "2026-06-17"). Nova versão publicada exige novo aceite.';
COMMENT ON COLUMN eula_aceites.ip          IS 'IP do cliente no momento do aceite (LGPD art. 37 — rastreabilidade).';
COMMENT ON COLUMN eula_aceites.user_agent  IS 'User-Agent do navegador no momento do aceite.';

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- Filtro mais frequente: verificar se um usuário de um tenant aceitou
-- determinada versão do EULA (query de gate de acesso na API).
CREATE INDEX IF NOT EXISTS idx_eula_tenant_user
  ON eula_aceites (tenant_id, user_id);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
-- A macro app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON … USING/WITH CHECK
--     (app_is_platform() OR tenant_id = app_current_tenant());
--
-- Garante:
--   • super_admin em modo plataforma (app_is_platform() = true) enxerga
--     todos os aceites de todos os tenants.
--   • Sessões de tenant enxergam apenas aceites do próprio tenant.
--   • Sessões sem tenant_id definido (app_current_tenant() = NULL) não
--     enxergam nada.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('eula_aceites');

-- ---------------------------------------------------------------------
-- GRANTs para portal_app e portal_ro
-- ---------------------------------------------------------------------
-- A API (role portal_app) precisa de INSERT (registrar aceite) e SELECT
-- (verificar se o usuário já aceitou a versão vigente).
-- Não há UPDATE nem DELETE: aceites são imutáveis (evidência de auditoria).
-- portal_ro recebe apenas SELECT (relatórios / DPO).
--
-- O bloco é idempotente: usa DO $$ IF EXISTS para não falhar em ambientes
-- onde os roles ainda não foram criados (ex.: setup fresh sem seed).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON eula_aceites TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON eula_aceites TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO
-- Executar em sessão de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_OUVIDOR_A>,
-- <UUID_OUVIDOR_B> pelos UUIDs reais do ambiente de teste.
-- NÃO executar em produção com dados reais.
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: dois ouvidores em tenants distintos
-- -----------------------------------------------------------------------

-- Tenant A = exemplolandia; Tenant B = outro tenant existente.

-- Simula aceite do ouvidor do Tenant A
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor',         true);
  PERFORM set_config('app.current_user_id',   '<UUID_OUVIDOR_A>', true);
END $$;

INSERT INTO eula_aceites (tenant_id, user_id, versao, ip, user_agent)
VALUES ('<UUID_TENANT_A>', '<UUID_OUVIDOR_A>', '2026-06-17',
        '127.0.0.1', 'Mozilla/5.0 (teste)');

-- -----------------------------------------------------------------------
-- TESTE 1: ouvidor do Tenant A vê o próprio aceite (espera 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor',         true);
END $$;

SELECT count(*) AS deve_ser_1 FROM eula_aceites;

-- -----------------------------------------------------------------------
-- TESTE 2: sessão do Tenant B NÃO vê aceites do Tenant A (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor',         true);
END $$;

SELECT count(*) AS deve_ser_0_tenant_b FROM eula_aceites;

-- -----------------------------------------------------------------------
-- TESTE 3: super_admin em modo plataforma vê todos os aceites (espera >= 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS total_plataforma FROM eula_aceites;

-- -----------------------------------------------------------------------
-- TESTE 4: unicidade (user_id, versao) — segundo aceite da mesma versão
--           pelo mesmo usuário deve falhar com 23505 unique_violation.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

-- Este INSERT deve lançar erro unique_violation (23505):
INSERT INTO eula_aceites (tenant_id, user_id, versao, ip)
VALUES ('<UUID_TENANT_A>', '<UUID_OUVIDOR_A>', '2026-06-17', '10.0.0.1');

-- -----------------------------------------------------------------------
-- TESTE 5: nova versão do EULA → novo aceite é permitido (espera sucesso)
-- -----------------------------------------------------------------------
INSERT INTO eula_aceites (tenant_id, user_id, versao, ip)
VALUES ('<UUID_TENANT_A>', '<UUID_OUVIDOR_A>', '2026-12-01', '127.0.0.1');

SELECT count(*) AS deve_ser_2_versoes
  FROM eula_aceites
 WHERE user_id = '<UUID_OUVIDOR_A>';

-- -----------------------------------------------------------------------
-- TESTE 6: sessão sem tenant definido (app_current_tenant() = NULL)
--           não enxerga nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM eula_aceites;

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM eula_aceites WHERE user_id = '<UUID_OUVIDOR_A>';

*/
