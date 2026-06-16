-- =====================================================================
-- 040 — Estrutura organizacional: tipo de órgão, unidades, autoridades
-- =====================================================================
-- A tabela `secretarias` passa a representar ÓRGÃOS (mantendo o nome). Um campo
-- `tipo` distingue gabinete/secretaria/departamento/procuradoria/controladoria/
-- contabilidade/autarquia/fundo/etc. Abaixo de cada órgão há UNIDADES. O órgão
-- do tipo `gabinete` tem AUTORIDADES (prefeito, vice, primeira-dama, chefe).
-- A página /institucional/estrutura é montada automaticamente a partir disso.
-- =====================================================================

ALTER TABLE secretarias
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'secretaria';
-- tipos: gabinete | secretaria | departamento | procuradoria | controladoria
--        | contabilidade | autarquia | fundacao | fundo | empresa | outro
CREATE INDEX IF NOT EXISTS idx_secretaria_tipo ON secretarias (tenant_id, tipo, ordem);

-- ── Unidades (subdivisões abaixo do órgão) ───────────────────────────
CREATE TABLE IF NOT EXISTS orgao_unidades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orgao_id    uuid NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  sigla       text,
  responsavel text,
  cargo       text,
  telefone    text,
  email       text,
  ordem       integer NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unidade_orgao ON orgao_unidades (tenant_id, orgao_id, ordem);
SELECT app_enable_tenant_rls('orgao_unidades');

-- ── Autoridades do Gabinete (executivo) ──────────────────────────────
CREATE TABLE IF NOT EXISTS gabinete_autoridades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orgao_id    uuid NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,  -- o gabinete
  cargo       text NOT NULL DEFAULT 'outro',  -- prefeito|vice_prefeito|primeira_dama|chefe_gabinete|outro
  nome        text NOT NULL,
  foto_url    text,
  email       text,
  telefone    text,
  bio         text,
  ordem       integer NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autoridade_orgao ON gabinete_autoridades (tenant_id, orgao_id, ordem);
SELECT app_enable_tenant_rls('gabinete_autoridades');
