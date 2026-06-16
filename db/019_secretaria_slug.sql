-- =====================================================================
-- 019 — Slug por secretaria (rota pública /secretarias/<slug> + menu)
-- =====================================================================
-- Cada secretaria passa a ter um slug estável → rota de detalhe própria e
-- item de menu individual. Backfill a partir do nome (sem acento).
-- =====================================================================

ALTER TABLE secretarias ADD COLUMN IF NOT EXISTS slug citext;

-- Backfill: slug derivado do nome (minúsculo, sem acento, hífens).
UPDATE secretarias
SET slug = trim(both '-' from regexp_replace(lower(unaccent(nome)), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Desambigua colisões raras (mesmo slug no mesmo tenant) com sufixo curto do id.
WITH d AS (
  SELECT id, tenant_id, slug,
         row_number() OVER (PARTITION BY tenant_id, slug ORDER BY criado_em) AS rn
  FROM secretarias
)
UPDATE secretarias s
SET slug = s.slug || '-' || left(s.id::text, 4)
FROM d
WHERE d.id = s.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_secretarias_tenant_slug ON secretarias (tenant_id, slug);
