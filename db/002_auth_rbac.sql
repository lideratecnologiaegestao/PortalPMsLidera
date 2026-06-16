-- =====================================================================
-- 002 — Autenticação, RBAC e estrutura organizacional (secretarias)
-- =====================================================================
-- Roles do PORTAL DE PREFEITURA (domínio diferente do SIAFI):
--   super_admin       → administra a PLATAFORMA (SaaS), cria tenants. Cross-tenant.
--   admin_prefeitura  → administra TODO o tenant da prefeitura.
--   gestor            → gestor de uma secretaria (conteúdo + dados da sua área).
--   ouvidor           → trata manifestações de Ouvidoria e ESIC.
--   servidor          → servidor designado para responder manifestações específicas.
--   cidadao           → acesso ao portal/app do cidadão.
-- =====================================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'admin_prefeitura',
  'gestor',
  'ouvidor',
  'servidor',
  'cidadao'
);

-- Secretarias (ex.: Saúde, Educação, Obras). Escopo por tenant.
CREATE TABLE secretarias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  sigla        text,
  email        citext,
  telefone     text,
  responsavel  text,
  ordem        int NOT NULL DEFAULT 0,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_secretarias_tenant ON secretarias (tenant_id);
SELECT app_enable_tenant_rls('secretarias');

-- Usuários. super_admin tem tenant_id NULL (pertence à plataforma).
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,
  secretaria_id  uuid REFERENCES secretarias(id) ON DELETE SET NULL,
  nome           text NOT NULL,
  email          citext NOT NULL,
  senha_hash     text,                 -- NULL quando autentica só via gov.br
  govbr_sub      text UNIQUE,          -- identificador do Login Único gov.br
  cpf            varchar(11),
  role           user_role NOT NULL DEFAULT 'cidadao',
  mfa_secret     text,
  mfa_habilitado boolean NOT NULL DEFAULT false,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  -- e-mail único POR tenant (mesmo CPF pode ser cidadão em várias prefeituras)
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);
CREATE INDEX idx_users_govbr ON users (govbr_sub);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
-- super_admin (tenant_id NULL) é visível só em modo plataforma; demais por tenant.
CREATE POLICY tenant_isolation ON users
  USING      (app_is_platform() OR tenant_id = app_current_tenant())
  WITH CHECK (app_is_platform() OR tenant_id = app_current_tenant());

-- FK tardia: audit_log.ator_id → users.id (criada aqui pois users só existe agora)
ALTER TABLE audit_log
  ADD CONSTRAINT fk_audit_ator FOREIGN KEY (ator_id) REFERENCES users(id) ON DELETE SET NULL;
