-- =====================================================================
-- 095 — História do Município (página institucional singleton por tenant)
-- =====================================================================
-- Página exclusiva da história do município, exibida em "A Prefeitura →
-- História do Município". Conteúdo em texto rico: o admin escolhe o formato
-- (HTML ou Markdown). Uma linha por tenant (tenant_id é a PK → upsert natural).
-- =====================================================================

CREATE TABLE IF NOT EXISTS historia_municipio (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  titulo        text,
  conteudo      text NOT NULL DEFAULT '',
  formato       text NOT NULL DEFAULT 'html',   -- 'html' | 'md'
  imagem_url    text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_historia_formato CHECK (formato IN ('html','md'))
);
SELECT app_enable_tenant_rls('historia_municipio');

-- atualizado_em automático
CREATE OR REPLACE FUNCTION trg_historia_municipio_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_historia_municipio_atualizado_em ON historia_municipio;
CREATE TRIGGER tg_historia_municipio_atualizado_em
  BEFORE UPDATE ON historia_municipio
  FOR EACH ROW EXECUTE FUNCTION trg_historia_municipio_atualizado_em();
