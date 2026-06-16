-- 055_redirects.sql
-- Redirecionamentos 301 administráveis por tenant (migração de URLs legadas Joomla → novos slugs).
-- Estratégia: RLS padrão via app_enable_tenant_rls() + UNIQUE (tenant_id, origem) para UPSERT idempotente.

CREATE TABLE IF NOT EXISTS redirects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  origem       text        NOT NULL,
  destino      text        NOT NULL,
  status_code  smallint    NOT NULL DEFAULT 301,
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirects_status_code_check CHECK (status_code IN (301, 302, 307, 308)),
  UNIQUE (tenant_id, origem)
);

-- Índice funcional para a rota pública /resolve (tenant_id + origem, somente ativos)
CREATE INDEX IF NOT EXISTS idx_redirects_resolve
  ON redirects (tenant_id, origem)
  WHERE ativo = true;

SELECT app_enable_tenant_rls('redirects');
