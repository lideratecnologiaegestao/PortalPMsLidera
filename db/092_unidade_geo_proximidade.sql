-- =====================================================================
-- 092 — Unidades do órgão: coluna geográfica + busca por proximidade
-- =====================================================================
-- Habilita "unidades perto de mim" (App do Cidadão / portal): além das colunas
-- latitude/longitude (091, usadas para deep-link de mapa), criamos uma coluna
-- PostGIS `geo geography(Point,4326)` DERIVADA automaticamente das coordenadas
-- por trigger, com índice GIST para consulta espacial (ST_DWithin/ST_Distance).
--
-- A coluna `geo` NÃO é modelada no Prisma (como em `chamados`): o Prisma grava
-- apenas latitude/longitude e o trigger mantém `geo` em sincronia; a busca de
-- proximidade é feita por $queryRaw. RLS já está ativo na tabela (040).
-- =====================================================================

ALTER TABLE orgao_unidades
  ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);

-- Mantém `geo` derivado de latitude/longitude em todo INSERT/UPDATE das coords.
CREATE OR REPLACE FUNCTION trg_orgao_unidade_geo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.geo := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_orgao_unidade_geo ON orgao_unidades;
CREATE TRIGGER tg_orgao_unidade_geo
  BEFORE INSERT OR UPDATE OF latitude, longitude ON orgao_unidades
  FOR EACH ROW EXECUTE FUNCTION trg_orgao_unidade_geo();

-- Backfill das unidades já cadastradas com coordenadas.
UPDATE orgao_unidades
   SET geo = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
 WHERE latitude IS NOT NULL AND longitude IS NOT NULL
   AND geo IS NULL;

-- Índice espacial para "perto de mim".
CREATE INDEX IF NOT EXISTS idx_unidade_geo ON orgao_unidades USING gist (geo);
