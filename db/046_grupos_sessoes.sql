-- =====================================================================
-- 046 — Grupos de acesso configuráveis e sessões de usuário
-- =====================================================================
-- Bloco: Usuários, grupos e permissões
--
-- Cria três tabelas:
--   grupos_acesso   — grupos de permissão configuráveis por município
--   usuario_grupos  — associação N:N usuário ↔ grupo (dentro do tenant)
--   user_sessions   — registro durável de sessões JWT + revogação server-side
--
-- Padrão de RLS:
--   grupos_acesso e usuario_grupos: tenant_id NOT NULL → app_enable_tenant_rls()
--   user_sessions: tenant_id NULLABLE (super_admin tem tenant_id NULL, igual a
--   users e audit_log) → policy customizada que espelha o audit_log de db/001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. grupos_acesso
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupos_acesso (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome         text        NOT NULL,
  descricao    text,
  -- Lista de chaves de permissão concedidas (ex.: 'noticias.gerenciar').
  -- O catálogo canônico fica na API; aqui só persistimos as chaves.
  permissoes   text[]      NOT NULL DEFAULT '{}',
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

COMMENT ON TABLE  grupos_acesso               IS 'Grupos de permissão configuráveis pelo município. Cada grupo agrega um conjunto de chaves de permissão e pode ser atribuído a N usuários do tenant.';
COMMENT ON COLUMN grupos_acesso.permissoes    IS 'Array de chaves de permissão concedidas ao grupo (ex.: noticias.gerenciar, esic.responder). Catálogo definido no código da API.';
COMMENT ON COLUMN grupos_acesso.ativo         IS 'Grupo inativo não concede permissões mesmo que o usuário esteja associado.';

CREATE INDEX IF NOT EXISTS idx_grupos_acesso_tenant
  ON grupos_acesso (tenant_id, ativo);

SELECT app_enable_tenant_rls('grupos_acesso');

-- ---------------------------------------------------------------------
-- 2. usuario_grupos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_grupos (
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  grupo_id   uuid        NOT NULL REFERENCES grupos_acesso(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, grupo_id)
);

COMMENT ON TABLE  usuario_grupos          IS 'Associação N:N entre usuários e grupos de acesso do tenant. Deletar o usuário ou o grupo remove automaticamente a linha.';
COMMENT ON COLUMN usuario_grupos.grupo_id IS 'Referência ao grupo de acesso. Cascade deleta a associação quando o grupo é removido.';

-- Índice para "quais usuários pertencem a este grupo?"
CREATE INDEX IF NOT EXISTS idx_usuario_grupos_grupo
  ON usuario_grupos (grupo_id);

-- Índice para filtro rápido por tenant (RLS + listagem)
CREATE INDEX IF NOT EXISTS idx_usuario_grupos_tenant
  ON usuario_grupos (tenant_id);

SELECT app_enable_tenant_rls('usuario_grupos');

-- ---------------------------------------------------------------------
-- 3. user_sessions
-- ---------------------------------------------------------------------
-- tenant_id NULLABLE: super_admin e jobs de plataforma geram sessões sem
-- tenant. A policy espelha exatamente a do audit_log em db/001:
--   modo plataforma → vê tudo (incluindo tenant_id IS NULL)
--   modo tenant     → vê só linhas do seu tenant
--   linhas com tenant_id NULL → visíveis apenas em modo plataforma
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
  -- id = jti do JWT; fornecido pela aplicação, não gerado pelo banco
  id                   uuid        PRIMARY KEY,
  tenant_id            uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip                   inet,
  user_agent           text,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  ultima_atividade_em  timestamptz NOT NULL DEFAULT now(),
  expira_em            timestamptz NOT NULL,
  -- NULL = sessão ativa; preenchido quando revogada
  revogado_em          timestamptz,
  -- Quem revogou (admin ou o próprio usuário)
  revogado_por         uuid        REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  user_sessions                   IS 'Registro durável de sessões JWT. Permite listar sessões ativas, exibir painel de usuários online e revogar tokens server-side sem blacklist separada. O id é o jti do JWT.';
COMMENT ON COLUMN user_sessions.id                IS 'Coincide com o campo jti do JWT emitido. Fornecido pela aplicação na criação da sessão.';
COMMENT ON COLUMN user_sessions.tenant_id         IS 'NULL para sessões de super_admin (escopo de plataforma). Demais usuários sempre têm tenant_id preenchido.';
COMMENT ON COLUMN user_sessions.revogado_em       IS 'NULL enquanto a sessão está ativa. Preenchido na revogação manual ou automática (logout, troca de senha, expiração antecipada).';
COMMENT ON COLUMN user_sessions.revogado_por      IS 'UUID do usuário que efetuou a revogação (pode ser o próprio dono ou um admin). NULL para expiração automática.';
COMMENT ON COLUMN user_sessions.ultima_atividade_em IS 'Atualizado a cada requisição autenticada; usado para exibir "visto por último" e detectar sessões inativas.';

-- Listar sessões ativas por tenant (filtro principal do painel)
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_ativa
  ON user_sessions (tenant_id, revogado_em);

-- Buscar todas as sessões de um usuário
CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions (user_id);

-- Varredura de limpeza de sessões expiradas (worker de TTL)
CREATE INDEX IF NOT EXISTS idx_user_sessions_expira
  ON user_sessions (expira_em);

-- RLS customizado (tenant_id nullable — mesmo racional do audit_log)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_sessions
  USING      (app_is_platform() OR tenant_id IS NULL OR tenant_id = app_current_tenant())
  WITH CHECK (app_is_platform() OR tenant_id IS NULL OR tenant_id = app_current_tenant());
