-- =====================================================================
-- 097 — Hino e Brasão (página institucional singleton por tenant)
-- =====================================================================
-- Página exclusiva exibida em "A Prefeitura → Hino e Brasão":
--  - Hino: letra (texto) em uma coluna e a mídia (áudio/vídeo enviado ou
--    YouTube) em outra.
--  - Brasão: miniaturas dos brasões (imagens da Biblioteca de Mídia) em uma
--    coluna e a história do brasão em outra.
-- Uma linha por tenant (tenant_id é a PK → upsert natural).
-- =====================================================================

CREATE TABLE IF NOT EXISTS hino_brasao (
  tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  hino_texto       text,
  hino_midia_tipo  text,                       -- 'audio' | 'video' | 'youtube' | NULL
  hino_midia_url   text,
  brasao_historia  text,
  brasoes          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ "url": "...", "titulo": "..." }]
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_hino_midia_tipo CHECK (hino_midia_tipo IS NULL OR hino_midia_tipo IN ('audio','video','youtube'))
);
SELECT app_enable_tenant_rls('hino_brasao');

-- atualizado_em automático
CREATE OR REPLACE FUNCTION trg_hino_brasao_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_hino_brasao_atualizado_em ON hino_brasao;
CREATE TRIGGER tg_hino_brasao_atualizado_em
  BEFORE UPDATE ON hino_brasao
  FOR EACH ROW EXECUTE FUNCTION trg_hino_brasao_atualizado_em();
