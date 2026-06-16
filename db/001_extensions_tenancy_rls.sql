-- =====================================================================
-- 001 — Extensões, registro de tenants e fundação do Row Level Security
-- =====================================================================
-- Estratégia de multi-tenancy: SHARED SCHEMA + tenant_id + RLS.
-- Cada requisição da API define o GUC `app.current_tenant_id` dentro de
-- uma transação (SET LOCAL via set_config). As policies de RLS leem esse
-- GUC para isolar os dados. Clientes grandes (capitais) podem migrar para
-- schema dedicado depois sem mudar o código de aplicação.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;      -- e-mails case-insensitive
CREATE EXTENSION IF NOT EXISTS postgis;     -- geo (buracos, terrenos, animais)
CREATE EXTENSION IF NOT EXISTS unaccent;    -- busca sem acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- busca fuzzy

-- ---------------------------------------------------------------------
-- Funções auxiliares de contexto de tenant
-- ---------------------------------------------------------------------
-- Retorna o tenant atual do contexto da transação (NULL se não definido).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- true quando a sessão está em modo plataforma (super_admin / jobs internos),
-- o que permite operar cross-tenant. Use com parcimônia.
CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.is_platform', true), 'off') = 'on';
$$;

-- ---------------------------------------------------------------------
-- Registro central de prefeituras (tenants). NÃO sofre RLS por tenant_id
-- porque é a própria tabela-registro; o acesso de escrita é restrito no
-- app à role super_admin.
-- ---------------------------------------------------------------------
CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          citext UNIQUE NOT NULL,          -- ex.: "cuiaba"
  nome          text   NOT NULL,                 -- "Prefeitura de Cuiabá"
  cnpj          varchar(14) UNIQUE,
  uf            char(2) NOT NULL,
  municipio_ibge varchar(7),                      -- código IBGE
  dominio       citext UNIQUE,                    -- "cuiaba.mt.gov.br" (domínio próprio)
  subdominio    citext UNIQUE,                    -- "cuiaba.suaplataforma.com.br"
  plano         text NOT NULL DEFAULT 'padrao',   -- padrao | capital | dedicado
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_dominio ON tenants (dominio);
CREATE INDEX idx_tenants_subdominio ON tenants (subdominio);

-- ---------------------------------------------------------------------
-- Macro reutilizável: aplica RLS padrão de tenant a uma tabela que tenha
-- coluna `tenant_id uuid`. Cria policy de isolamento + força RLS inclusive
-- para o dono da tabela.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_enable_tenant_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format($f$
    CREATE POLICY tenant_isolation ON %s
    USING      (app_is_platform() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform() OR tenant_id = app_current_tenant())
  $f$, p_table);
END;
$$;

-- ---------------------------------------------------------------------
-- Auditoria global (uma linha por ação sensível). Reaproveitada por
-- workers (dead-letter), RBAC e fluxos de manifestações.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ator_id      uuid,                 -- usuário/servidor que agiu (pode ser NULL p/ sistema)
  acao         text NOT NULL,        -- ex.: "MANIFESTACAO_RESPONDIDA", "SLA_WORKER_FALHOU"
  entidade     text NOT NULL,        -- ex.: "manifestacao", "queue"
  entidade_id  text,
  dados        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           inet,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant ON audit_log (tenant_id, criado_em DESC);
SELECT app_enable_tenant_rls('audit_log');
-- audit_log permite tenant_id NULL para eventos de plataforma:
DROP POLICY tenant_isolation ON audit_log;
CREATE POLICY tenant_isolation ON audit_log
  USING      (app_is_platform() OR tenant_id IS NULL OR tenant_id = app_current_tenant())
  WITH CHECK (app_is_platform() OR tenant_id IS NULL OR tenant_id = app_current_tenant());
