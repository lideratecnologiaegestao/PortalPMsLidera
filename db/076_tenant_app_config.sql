-- =====================================================================
-- 076 — Configuração do App do Cidadão por tenant (ADR-0006, Fase 1)
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Armazena as configurações white-label do aplicativo móvel (Expo/React
-- Native) para cada prefeitura (tenant). Divide-se em dois escopos:
--
--   BUILD-TIME  — identidade e assets que entram no bundle (app_name,
--                 bundle_id, ícone, splash): registrados aqui para que
--                 o pipeline de build do EAS os consuma via API.
--
--   RUNTIME     — tema de cores, módulos habilitados, slides de
--                 onboarding, acesso rápido, categorias de chamados e
--                 flags de comportamento: lidos pelo app na inicialização
--                 via endpoint de configuração (GET /app-config), com
--                 cache local.
--
-- O endpoint público de configuração é resolvido pela API usando o Host
-- do request para identificar o tenant e setar o GUC
-- app.current_tenant_id — portanto a policy padrão de tenant já cobre
-- a leitura do cidadão sem autenticação prévia.
--
-- ISOLAMENTO
-- ----------
-- Uma linha por tenant (UNIQUE tenant_id). RLS padrão multi-tenant
-- (macro app_enable_tenant_rls): cada sessão de tenant enxerga apenas
-- a própria linha; super_admin em modo plataforma enxerga todas.
--
-- LGPD / PII
-- ----------
-- Nenhum dado pessoal é armazenado aqui. Os campos JSONB (onboarding,
-- acesso rápido, categorias) contêm apenas conteúdo institucional
-- (títulos, descrições, rotas, ícones). Base legal: interesse legítimo
-- da Administração Pública (LGPD art. 7º, III).
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS para
-- que re-executar a migration não cause erro em nenhum ambiente.
-- Aplicar como superusuário postgres.
-- =====================================================================

-- =====================================================================
-- Tabela: tenant_app_config
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenant_app_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant. CASCADE remove a config junto com o tenant
  -- (off-boarding). UNIQUE garante exatamente 1 linha por prefeitura.
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- ------------------------------------------------------------------
  -- Identidade do build (build-time)
  -- Campos lidos pelo pipeline EAS antes de compilar o APK/IPA.
  -- Nenhum desses campos contém PII.
  -- ------------------------------------------------------------------
  app_name        text,          -- "Prefeitura de Exemplolandia"
  app_short_name  text,          -- "Exemplolandia" (ícone/launcher)
  bundle_id       text,          -- "br.gov.exemplolandia.app"
  scheme          text,          -- deep link scheme: "exemplolandia"
  api_url         text,          -- URL base da API deste tenant
  eas_project_id  text,          -- UUID do projeto no Expo Application Services
  eas_owner       text,          -- slug da conta EAS dona do build
  app_version     text           NOT NULL DEFAULT '1.0.0',

  -- ------------------------------------------------------------------
  -- Assets de build (build-time)
  -- Chaves de armazenamento (MinIO/S3) dos arquivos binários que o
  -- pipeline baixa antes de compilar. O bucket é o mesmo usado pelo
  -- módulo de mídias; o acesso é via backend, não por URL pública.
  -- ------------------------------------------------------------------
  icon_storage_key   text,       -- ícone 1024×1024 PNG (chave no storage)
  splash_storage_key text,       -- imagem de splash (chave no storage)
  splash_bg_color    text        NOT NULL DEFAULT '#1351b4',

  -- ------------------------------------------------------------------
  -- Tema (runtime)
  -- Lidos pelo app na inicialização e aplicados ao ThemeProvider.
  -- Padrão gov.br (azul).
  -- ------------------------------------------------------------------
  primary_color   text        NOT NULL DEFAULT '#1351b4',
  secondary_color text        NOT NULL DEFAULT '#071d41',

  -- ------------------------------------------------------------------
  -- Módulos (runtime)
  -- Flags booleanas que controlam quais abas/fluxos o app expõe ao
  -- cidadão. Permite que cada prefeitura ative apenas o que contratou.
  -- ------------------------------------------------------------------
  modulo_denuncia  boolean     NOT NULL DEFAULT true,
  modulo_mapa      boolean     NOT NULL DEFAULT true,
  modulo_ouvidoria boolean     NOT NULL DEFAULT true,
  modulo_esic      boolean     NOT NULL DEFAULT true,
  modulo_chat      boolean     NOT NULL DEFAULT false,  -- atendimento IA (bloco 13)
  modulo_servicos  boolean     NOT NULL DEFAULT true,
  modulo_noticias  boolean     NOT NULL DEFAULT true,
  modulo_carteira  boolean     NOT NULL DEFAULT false,  -- carteira digital (fase futura)

  -- ------------------------------------------------------------------
  -- Conteúdo institucional (runtime, JSONB)
  -- Estrutura esperada de cada array é documentada abaixo.
  -- Nenhum campo contém PII.
  --
  -- onboarding_slides: [{titulo, descricao, imagemUrl}]
  --   Telas de apresentação exibidas no primeiro acesso.
  --
  -- acesso_rapido: [{titulo, path, icone}]
  --   Atalhos configuráveis exibidos na home do app (grid de ícones).
  --
  -- categorias_chamados: [{id, titulo, icone, subcategorias?: [...]}]
  --   Árvore de categorias para abertura de denúncias/chamados.
  --   O app filtra somente se modulo_denuncia = true.
  -- ------------------------------------------------------------------
  onboarding_slides    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  acesso_rapido        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  categorias_chamados  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- ------------------------------------------------------------------
  -- Push / comportamento (runtime)
  -- ------------------------------------------------------------------
  push_habilitado       boolean     NOT NULL DEFAULT true,
  biometria_habilitada  boolean     NOT NULL DEFAULT false,
  onboarding_ativo      boolean     NOT NULL DEFAULT true,  -- false = pula onboarding

  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_app_config_tenant UNIQUE (tenant_id)
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE tenant_app_config IS
  'Configuração white-label do App do Cidadão por tenant (ADR-0006 Fase 1). '
  'Uma linha por prefeitura. Campos build-time alimentam o pipeline EAS; '
  'campos runtime são lidos pelo app na inicialização. Sem PII; base legal: '
  'LGPD art. 7º III. Por tenant com RLS.';

COMMENT ON COLUMN tenant_app_config.app_name IS
  'Nome completo exibido nas lojas (ex.: "Prefeitura de Exemplolandia"). Build-time.';

COMMENT ON COLUMN tenant_app_config.app_short_name IS
  'Nome curto exibido no ícone/launcher (ex.: "Exemplolandia"). Build-time.';

COMMENT ON COLUMN tenant_app_config.bundle_id IS
  'Identificador único do bundle iOS/Android (ex.: "br.gov.exemplolandia.app"). '
  'Deve seguir convenção reversa de domínio. Build-time.';

COMMENT ON COLUMN tenant_app_config.scheme IS
  'Scheme de deep link (ex.: "exemplolandia" → exemplolandia://). Build-time.';

COMMENT ON COLUMN tenant_app_config.api_url IS
  'URL base da API deste tenant, usada pelo app em runtime e pelo pipeline de '
  'build para injetar no bundle via expo-constants.';

COMMENT ON COLUMN tenant_app_config.eas_project_id IS
  'UUID do projeto no Expo Application Services. Build-time; necessário para '
  'eas build e eas update.';

COMMENT ON COLUMN tenant_app_config.eas_owner IS
  'Slug da conta EAS proprietária do projeto de build (ex.: "lidera-tecnologia"). '
  'Build-time.';

COMMENT ON COLUMN tenant_app_config.app_version IS
  'Versão semântica do app (semver). Exibida nas lojas e usada pelo OTA update '
  'para controle de compatibilidade.';

COMMENT ON COLUMN tenant_app_config.icon_storage_key IS
  'Chave MinIO/S3 do ícone 1024×1024 PNG. O pipeline de build baixa via API. '
  'Nunca expor URL pública do storage. Build-time.';

COMMENT ON COLUMN tenant_app_config.splash_storage_key IS
  'Chave MinIO/S3 da imagem de splash. O pipeline de build baixa via API. '
  'Build-time.';

COMMENT ON COLUMN tenant_app_config.splash_bg_color IS
  'Cor de fundo da splash screen em hex (ex.: "#1351b4"). Padrão gov.br. '
  'Build-time.';

COMMENT ON COLUMN tenant_app_config.primary_color IS
  'Cor primária do tema em hex. Aplicada ao ThemeProvider em runtime. '
  'Padrão: #1351b4 (azul gov.br).';

COMMENT ON COLUMN tenant_app_config.secondary_color IS
  'Cor secundária do tema em hex. Padrão: #071d41 (azul escuro gov.br).';

COMMENT ON COLUMN tenant_app_config.modulo_denuncia IS
  'Habilita o fluxo de denúncias/chamados georreferenciados. '
  'Requer modulo_mapa = true para exibir o mapa de ocorrências.';

COMMENT ON COLUMN tenant_app_config.modulo_mapa IS
  'Habilita a aba de mapa de chamados/ocorrências.';

COMMENT ON COLUMN tenant_app_config.modulo_ouvidoria IS
  'Habilita o acesso à ouvidoria municipal pelo app.';

COMMENT ON COLUMN tenant_app_config.modulo_esic IS
  'Habilita o fluxo de pedidos de acesso à informação (e-SIC/LAI).';

COMMENT ON COLUMN tenant_app_config.modulo_chat IS
  'Habilita o chat de atendimento IA/humano (bloco 13 — atendimento omnichannel). '
  'Default false: requer módulo de atendimento ativo no tenant.';

COMMENT ON COLUMN tenant_app_config.modulo_servicos IS
  'Habilita a Carta de Serviços no app.';

COMMENT ON COLUMN tenant_app_config.modulo_noticias IS
  'Habilita o feed de notícias da prefeitura.';

COMMENT ON COLUMN tenant_app_config.modulo_carteira IS
  'Habilita a carteira digital do cidadão (fase futura). Default false.';

COMMENT ON COLUMN tenant_app_config.onboarding_slides IS
  'Array de slides de apresentação: [{titulo, descricao, imagemUrl}]. '
  'Exibido no primeiro acesso se onboarding_ativo = true. Sem PII.';

COMMENT ON COLUMN tenant_app_config.acesso_rapido IS
  'Array de atalhos na home do app: [{titulo, path, icone}]. '
  'Configurável por cada prefeitura. Sem PII.';

COMMENT ON COLUMN tenant_app_config.categorias_chamados IS
  'Árvore de categorias para abertura de chamados/denúncias: '
  '[{id, titulo, icone, subcategorias?: [...]}]. '
  'Usado somente se modulo_denuncia = true. Sem PII.';

COMMENT ON COLUMN tenant_app_config.push_habilitado IS
  'Habilita notificações push (Expo Push Notifications). '
  'false = app não solicita permissão de push ao cidadão.';

COMMENT ON COLUMN tenant_app_config.biometria_habilitada IS
  'Habilita autenticação biométrica (Face ID / Impressão digital) no app. '
  'false = login apenas por senha.';

COMMENT ON COLUMN tenant_app_config.onboarding_ativo IS
  'true = exibe os onboarding_slides no primeiro acesso. '
  'false = pula onboarding (útil p/ tenants que preferem entrada direta).';

-- ---------------------------------------------------------------------
-- Índice principal
-- ---------------------------------------------------------------------
-- Lookup por tenant_id é O(1) pelo UNIQUE (uq_tenant_app_config_tenant),
-- mas um índice explícito torna o plano mais previsível em joins e é
-- exigido pelas regras de índice do projeto para filtro frequente por
-- tenant_id.
CREATE INDEX IF NOT EXISTS idx_tenant_app_config_tenant_id
  ON tenant_app_config (tenant_id);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
-- app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON … USING / WITH CHECK
--     (app_is_platform() OR tenant_id = app_current_tenant());
--
-- O endpoint GET /app-config é público (sem auth do cidadão): a API
-- identifica o tenant pelo Host do request e seta o GUC
-- app.current_tenant_id antes da query — a policy padrão cobre esse
-- caso sem alteração especial.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('tenant_app_config');

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_tenant_app_config_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tenant_app_config_atualizado_em ON tenant_app_config;
CREATE TRIGGER tg_tenant_app_config_atualizado_em
  BEFORE UPDATE ON tenant_app_config
  FOR EACH ROW EXECUTE FUNCTION trg_tenant_app_config_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_app_config TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON tenant_app_config TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- Tabela: tenant_app_builds
-- =====================================================================
-- Histórico de builds disparados para cada tenant via EAS (Expo
-- Application Services). Criada na Fase 1 para que a API já possa
-- registrar builds iniciados pelo pipeline; o painel de gerenciamento
-- do build (acionamento manual, status em tempo real) é entregue na
-- Fase 2.
--
-- ISOLAMENTO: RLS padrão multi-tenant. Um build pertence ao tenant que
-- o solicitou; administradores da plataforma enxergam todos.
--
-- LGPD: campo solicitado_por referencia users.id (não replica dados do
-- usuário). É dado de auditoria operacional, não PII sensível. Base
-- legal: interesse legítimo (LGPD art. 7º, III).
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenant_app_builds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Perfil de build EAS: preview (distribuição interna) ou production
  -- (lojas). Texto livre para suportar perfis customizados futuros.
  perfil          text        NOT NULL,  -- preview | production

  -- Plataforma alvo do build.
  plataforma      text        NOT NULL DEFAULT 'android',  -- android | ios | all

  -- FSM de status do build.
  status          text        NOT NULL DEFAULT 'enfileirado'
                    CHECK (status IN (
                      'enfileirado',  -- job criado, aguardando worker
                      'preparando',   -- clonando repo, gerando app.json
                      'em_build',     -- EAS compilando
                      'concluido',    -- APK/IPA disponível
                      'falhou'        -- ver erro_resumo
                    )),

  -- Referências ao EAS (preenchidas pelo worker após submissão).
  eas_build_id    text,          -- ID do build no EAS
  eas_build_url   text,          -- URL de acompanhamento no expo.dev

  -- URL do log completo (armazenado no MinIO ou link externo).
  log_url         text,

  -- Resumo do erro em caso de falha (primeiras 2 000 chars do log).
  -- Nunca armazenar segredos — o worker deve sanitizar antes de gravar.
  erro_resumo     text,

  -- Usuário (admin) que disparou o build. SET NULL preserva histórico
  -- mesmo que o usuário seja removido.
  solicitado_por  uuid        REFERENCES users(id) ON DELETE SET NULL,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE tenant_app_builds IS
  'Histórico de builds EAS por tenant (ADR-0006). '
  'Criada na Fase 1; painel de acionamento entregue na Fase 2. '
  'Campo erro_resumo deve ser sanitizado pelo worker (sem segredos). '
  'Base legal: LGPD art. 7º III (interesse legítimo operacional).';

COMMENT ON COLUMN tenant_app_builds.perfil IS
  'Perfil de build EAS (ex.: "preview", "production"). '
  'Texto livre para suportar perfis customizados.';

COMMENT ON COLUMN tenant_app_builds.plataforma IS
  'Plataforma alvo: "android", "ios" ou "all".';

COMMENT ON COLUMN tenant_app_builds.status IS
  'FSM: enfileirado → preparando → em_build → concluido | falhou.';

COMMENT ON COLUMN tenant_app_builds.eas_build_id IS
  'ID do build atribuído pelo Expo Application Services após submissão.';

COMMENT ON COLUMN tenant_app_builds.eas_build_url IS
  'URL do build no expo.dev para acompanhamento em tempo real.';

COMMENT ON COLUMN tenant_app_builds.log_url IS
  'URL do log completo do build (MinIO ou link externo).';

COMMENT ON COLUMN tenant_app_builds.erro_resumo IS
  'Primeiras linhas do log de erro sanitizadas (sem segredos/tokens). '
  'Preenchido apenas quando status = "falhou".';

COMMENT ON COLUMN tenant_app_builds.solicitado_por IS
  'Usuário admin que disparou o build. '
  'SET NULL: histórico preservado mesmo após remoção do usuário.';

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
-- Consulta mais frequente: listar builds de um tenant ordenados por
-- data (painel de histórico e worker de polling de status).
CREATE INDEX IF NOT EXISTS idx_tenant_app_builds_tenant_criado
  ON tenant_app_builds (tenant_id, criado_em DESC);

-- Filtro de builds em andamento (worker de polling de status EAS).
CREATE INDEX IF NOT EXISTS idx_tenant_app_builds_tenant_status
  ON tenant_app_builds (tenant_id, status)
  WHERE status IN ('enfileirado', 'preparando', 'em_build');

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('tenant_app_builds');

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_tenant_app_builds_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tenant_app_builds_atualizado_em ON tenant_app_builds;
CREATE TRIGGER tg_tenant_app_builds_atualizado_em
  BEFORE UPDATE ON tenant_app_builds
  FOR EACH ROW EXECUTE FUNCTION trg_tenant_app_builds_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_app_builds TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON tenant_app_builds TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- BLOCO DE VERIFICACAO (comentado — nao executar em producao)
-- Executar manualmente em sessao de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A> e <UUID_TENANT_B> pelos UUIDs reais do
-- ambiente de teste (porta 5433 / container PostGIS local).
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparacao: modo plataforma para insercoes de bootstrap
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- Config do Tenant A (Exemplolandia)
INSERT INTO tenant_app_config (
  tenant_id, app_name, app_short_name, bundle_id, scheme, api_url,
  primary_color, secondary_color,
  modulo_denuncia, modulo_mapa, modulo_ouvidoria, modulo_esic,
  modulo_chat, modulo_servicos, modulo_noticias, modulo_carteira,
  onboarding_slides, acesso_rapido, categorias_chamados,
  push_habilitado, biometria_habilitada, onboarding_ativo
) VALUES (
  '<UUID_TENANT_A>',
  'Prefeitura de Exemplolandia', 'Exemplolandia',
  'br.gov.exemplolandia.app', 'exemplolandia',
  'https://api.exemplolandia.gov.br',
  '#1351b4', '#071d41',
  true, true, true, true,
  false, true, true, false,
  '[{"titulo":"Bem-vindo","descricao":"Seu app municipal","imagemUrl":""}]'::jsonb,
  '[{"titulo":"Ouvidoria","path":"/ouvidoria","icone":"megaphone"}]'::jsonb,
  '[{"id":"1","titulo":"Buraco na via","icone":"road"}]'::jsonb,
  true, false, true
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Config do Tenant B (para isolamento)
INSERT INTO tenant_app_config (tenant_id, app_name, primary_color)
VALUES ('<UUID_TENANT_B>', 'Prefeitura B', '#c00000')
ON CONFLICT (tenant_id) DO NOTHING;

-- -----------------------------------------------------------------------
-- TESTE 1: sessao do Tenant A enxerga apenas 1 linha (a propria)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_a FROM tenant_app_config;

-- -----------------------------------------------------------------------
-- TESTE 2: sessao do Tenant B nao enxerga config do Tenant A
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*)    AS deve_ser_1_tenant_b  FROM tenant_app_config;
SELECT app_name    AS deve_ser_prefeitura_b FROM tenant_app_config WHERE tenant_id = '<UUID_TENANT_B>';

-- Garantir que Tenant B NAO le config do Tenant A
SELECT count(*) AS deve_ser_0_cross_tenant
  FROM tenant_app_config
 WHERE tenant_id = '<UUID_TENANT_A>';

-- -----------------------------------------------------------------------
-- TESTE 3: super_admin em modo plataforma ve as duas linhas
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_2_plataforma FROM tenant_app_config;

-- -----------------------------------------------------------------------
-- TESTE 4: sessao sem tenant nao enxerga nada
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM tenant_app_config;

-- -----------------------------------------------------------------------
-- TESTE 5: trigger de atualizado_em funciona
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

UPDATE tenant_app_config
   SET app_version = '1.0.1'
 WHERE tenant_id = '<UUID_TENANT_A>';

SELECT app_version, atualizado_em
  FROM tenant_app_config
 WHERE tenant_id = '<UUID_TENANT_A>';
-- Espera: app_version='1.0.1', atualizado_em recente (now() do UPDATE)

-- -----------------------------------------------------------------------
-- TESTE 6: tenant_app_builds — inserir e verificar isolamento
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

INSERT INTO tenant_app_builds (tenant_id, perfil, plataforma, status)
VALUES ('<UUID_TENANT_A>', 'preview', 'android', 'enfileirado');

INSERT INTO tenant_app_builds (tenant_id, perfil, plataforma, status)
VALUES ('<UUID_TENANT_B>', 'production', 'android', 'concluido');

-- Tenant A so ve o proprio build
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_1_builds_tenant_a FROM tenant_app_builds;

-- Tenant B so ve o proprio build
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_1_builds_tenant_b FROM tenant_app_builds;

-- Plataforma ve os dois
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_2_builds_plataforma FROM tenant_app_builds;

-- -----------------------------------------------------------------------
-- TESTE 7: index parcial de builds ativos (worker de polling)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename IN ('tenant_app_config', 'tenant_app_builds')
 ORDER BY tablename, indexname;
-- Espera indices: idx_tenant_app_config_tenant_id,
--                idx_tenant_app_builds_tenant_criado,
--                idx_tenant_app_builds_tenant_status (parcial)

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM tenant_app_builds WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');
DELETE FROM tenant_app_config  WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');

*/
