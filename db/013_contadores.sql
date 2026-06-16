-- =====================================================================
-- 013 — Contadores atômicos de protocolo (corrige race condition)
-- =====================================================================
-- O protocolo sequencial (AAAA000001) era gerado por count()+1 — sujeito a
-- corrida (dois registros simultâneos geram o mesmo número e o segundo falha
-- na UNIQUE). A incrementação passa a ser ATÔMICA via UPSERT com RETURNING.
-- =====================================================================

CREATE TABLE protocolo_contadores (
  tenant_id uuid   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  escopo    text   NOT NULL,        -- 'manifestacao' | 'chamado' | ...
  ano       int    NOT NULL,
  valor     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, escopo, ano)
);
SELECT app_enable_tenant_rls('protocolo_contadores');
