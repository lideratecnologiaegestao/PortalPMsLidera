-- =====================================================================
-- 078 — Nota pessoal (sticky note) do Painel BI administrativo
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Armazena uma única nota de texto livre por usuário por tenant,
-- exibida como "sticky note" no Painel BI do admin (/admin/dashboard).
-- O usuário pode editar livremente; cada salvamento sobrescreve o
-- conteúdo anterior (upsert por chave primária composta).
--
-- DESIGN
-- ------
-- Chave primária composta (tenant_id, usuario_id) impõe a regra de
-- negócio de forma declarativa no banco: exatamente uma nota por
-- usuário por tenant, sem necessidade de constraint UNIQUE separada.
--
-- Não há coluna 'id' autogerada: o par (tenant_id, usuario_id) já
-- identifica univocamente a linha e é o único lookup realizado.
--
-- LGPD / DADOS PESSOAIS
-- ---------------------
-- O campo 'conteudo' é texto livre e pode conter PII inadvertida
-- digitada pelo servidor público. Base legal: interesse legítimo da
-- Administração Pública (LGPD art. 7º, IX) — uso interno de ferramenta
-- administrativa por servidor autenticado. O dado não é compartilhado
-- com terceiros nem exibido publicamente.
--
-- Direito de eliminação (LGPD art. 18, VI): o usuário pode apagar a
-- nota a qualquer momento pela interface do painel; o backend executa
-- DELETE ou UPDATE conteudo = ''.
--
-- ISOLAMENTO
-- ----------
-- RLS padrão multi-tenant via app_enable_tenant_rls: cada sessão de
-- tenant enxerga apenas as próprias linhas; super_admin em modo
-- plataforma enxerga todas (auditoria). A policy USING/WITH CHECK
-- usa app.current_tenant_id (GUC setado pelo PrismaService antes de
-- cada query), garantindo que um servidor de uma prefeitura não leia
-- nem escreva notas de outra prefeitura.
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
-- para que re-executar a migration não cause erro em nenhum ambiente.
-- Aplicar como superusuário postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela: dashboard_notas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_notas (

  -- Isolamento multi-tenant obrigatório (regra inviolável do projeto).
  -- CASCADE remove a nota quando o tenant é desativado/excluído.
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Usuário dono da nota.
  -- CASCADE remove a nota quando o usuário é excluído (dado pessoal:
  -- eliminar junto é a opção conservadora e alinhada à LGPD art. 18 VI).
  usuario_id    uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,

  -- Conteúdo da nota. Texto livre; DEFAULT '' permite upsert sem
  -- fornecer conteúdo (cria nota vazia que o usuário preenche depois).
  conteudo      text        NOT NULL DEFAULT '',

  -- Timestamp de última modificação. Atualizado automaticamente pelo
  -- trigger abaixo em cada UPDATE, refletindo quando o usuário salvou.
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- Chave primária composta: uma única nota por usuário por tenant.
  -- Também serve como índice clustered para o lookup (tenant_id, usuario_id).
  CONSTRAINT pk_dashboard_notas PRIMARY KEY (tenant_id, usuario_id)
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE dashboard_notas IS
  'Nota pessoal (sticky note) por usuário no Painel BI administrativo. '
  'Uma linha por (tenant_id, usuario_id). Conteúdo livre pode conter PII; '
  'base legal: LGPD art. 7º IX (interesse legítimo — uso interno). '
  'Por tenant com RLS; CASCADE em tenant e usuário.';

COMMENT ON COLUMN dashboard_notas.tenant_id IS
  'Prefeitura (tenant) à qual a nota pertence. '
  'FK → tenants(id) ON DELETE CASCADE.';

COMMENT ON COLUMN dashboard_notas.usuario_id IS
  'Servidor público dono da nota. '
  'FK → users(id) ON DELETE CASCADE: nota removida junto com o usuário '
  '(direito de eliminação LGPD art. 18 VI).';

COMMENT ON COLUMN dashboard_notas.conteudo IS
  'Texto livre da nota. Pode conter PII inadvertida. '
  'Não exibir para outros usuários nem expor em APIs públicas. '
  'DEFAULT vazio permite criação sem conteúdo inicial.';

COMMENT ON COLUMN dashboard_notas.atualizado_em IS
  'Timestamp do último salvamento pelo usuário. '
  'Atualizado automaticamente pelo trigger tg_dashboard_notas_atualizado_em.';

-- ---------------------------------------------------------------------
-- Índice de apoio ao RLS
-- ---------------------------------------------------------------------
-- A PK (tenant_id, usuario_id) já cobre o único lookup relevante.
-- Um índice separado em tenant_id sozinho é útil para o filtro RLS
-- (PostgreSQL pode usá-lo para eliminar páginas antes de avaliar a
-- policy) e para queries de auditoria da plataforma (listar todas as
-- notas de um tenant sem fixar usuario_id).
CREATE INDEX IF NOT EXISTS idx_dashboard_notas_tenant_id
  ON dashboard_notas (tenant_id);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
-- app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON … USING / WITH CHECK
--     (app_is_platform() OR tenant_id = app_current_tenant());
--
-- Garante:
--   • super_admin em modo plataforma (app_is_platform() = true) enxerga
--     notas de todos os tenants (auditoria LGPD/segurança).
--   • Sessões de tenant enxergam apenas notas do próprio tenant.
--   • Sessões sem tenant_id definido (app_current_tenant() = NULL)
--     não enxergam nada.
--
-- Isolamento adicional por usuario_id é aplicado na camada de
-- aplicação (NestJS filtra WHERE usuario_id = req.user.id), pois RLS
-- não depende do usuário autenticado — apenas do tenant GUC.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('dashboard_notas');

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_dashboard_notas_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_dashboard_notas_atualizado_em ON dashboard_notas;
CREATE TRIGGER tg_dashboard_notas_atualizado_em
  BEFORE UPDATE ON dashboard_notas
  FOR EACH ROW EXECUTE FUNCTION trg_dashboard_notas_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs para os roles da aplicação
-- ---------------------------------------------------------------------
-- portal_app (role da API NestJS): CRUD completo.
--   SELECT  — carregar nota ao abrir o dashboard.
--   INSERT  — criar nota na primeira vez que o usuário salva.
--   UPDATE  — salvar edições subsequentes (conteúdo + atualizado_em).
--   DELETE  — usuário apaga a nota pelo painel (LGPD art. 18 VI).
-- portal_ro (relatórios / DPO): somente leitura.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON dashboard_notas TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON dashboard_notas TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO (comentado — não executar em produção)
-- Executar manualmente em sessão de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_USER_A>,
-- <UUID_USER_B> pelos UUIDs reais do ambiente de teste
-- (porta 5433 / container PostGIS local — ver rls-test-local-env.md).
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: modo plataforma para inserções de bootstrap
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- Nota do Usuário A no Tenant A
INSERT INTO dashboard_notas (tenant_id, usuario_id, conteudo)
VALUES ('<UUID_TENANT_A>', '<UUID_USER_A>', 'Lembrar de verificar relatório ESIC amanhã.')
ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET conteudo = EXCLUDED.conteudo;

-- Nota do Usuário B no Tenant B (outro tenant — teste de isolamento)
INSERT INTO dashboard_notas (tenant_id, usuario_id, conteudo)
VALUES ('<UUID_TENANT_B>', '<UUID_USER_B>', 'Nota do outro tenant — nunca deve vazar.')
ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET conteudo = EXCLUDED.conteudo;

-- -----------------------------------------------------------------------
-- TESTE 1: sessão do Tenant A enxerga apenas 1 nota (a própria)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_a FROM dashboard_notas;

-- -----------------------------------------------------------------------
-- TESTE 2: Tenant A não enxerga nota do Tenant B (deve retornar 0)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_0_cross_tenant
  FROM dashboard_notas
 WHERE tenant_id = '<UUID_TENANT_B>';

-- -----------------------------------------------------------------------
-- TESTE 3: sessão do Tenant B enxerga apenas 1 nota (a própria)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_b FROM dashboard_notas;

-- -----------------------------------------------------------------------
-- TESTE 4: super_admin em modo plataforma vê as 2 notas
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_2_plataforma FROM dashboard_notas;

-- -----------------------------------------------------------------------
-- TESTE 5: sessão sem tenant definido não enxerga nada (deve retornar 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM dashboard_notas;

-- -----------------------------------------------------------------------
-- TESTE 6: upsert — atualizar conteúdo da nota existente
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

INSERT INTO dashboard_notas (tenant_id, usuario_id, conteudo)
VALUES ('<UUID_TENANT_A>', '<UUID_USER_A>', 'Conteúdo atualizado via upsert.')
ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET conteudo = EXCLUDED.conteudo;

SELECT conteudo, atualizado_em
  FROM dashboard_notas
 WHERE tenant_id  = '<UUID_TENANT_A>'
   AND usuario_id = '<UUID_USER_A>';
-- Espera: conteudo = 'Conteúdo atualizado via upsert.', atualizado_em recente

-- -----------------------------------------------------------------------
-- TESTE 7: trigger de atualizado_em funciona em UPDATE direto
-- -----------------------------------------------------------------------
UPDATE dashboard_notas
   SET conteudo = 'Atualização direta pelo trigger.'
 WHERE tenant_id  = '<UUID_TENANT_A>'
   AND usuario_id = '<UUID_USER_A>';

SELECT conteudo, atualizado_em
  FROM dashboard_notas
 WHERE tenant_id  = '<UUID_TENANT_A>'
   AND usuario_id = '<UUID_USER_A>';
-- Espera: conteudo = 'Atualização direta pelo trigger.', atualizado_em = now()

-- -----------------------------------------------------------------------
-- TESTE 8: verificar índices no catálogo
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'dashboard_notas'
 ORDER BY indexname;
-- Espera:
--   dashboard_notas_pkey               (tenant_id, usuario_id)
--   idx_dashboard_notas_tenant_id      (tenant_id)

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM dashboard_notas
 WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');

*/
