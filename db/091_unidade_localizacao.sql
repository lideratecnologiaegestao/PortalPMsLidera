-- =====================================================================
-- 091 — Unidades do órgão: localização, atendimento e fachada
-- =====================================================================
-- As UNIDADES (orgao_unidades) passam a ter dados de localização para que o
-- cidadão encontre o local facilmente e abra direto no Waze/Google Maps:
--   endereco / cep        — endereço textual (fallback de busca no mapa)
--   horario               — horário de atendimento da unidade
--   foto_url              — foto da fachada (sobe via API → storage)
--   latitude / longitude  — coordenadas (graus decimais, WGS84). Floats simples
--                           — não usamos PostGIS aqui porque não há consulta
--                           espacial; é um ponto estático para deep-link de mapa.
-- =====================================================================

ALTER TABLE orgao_unidades
  ADD COLUMN IF NOT EXISTS endereco   text,
  ADD COLUMN IF NOT EXISTS cep        text,
  ADD COLUMN IF NOT EXISTS horario    text,
  ADD COLUMN IF NOT EXISTS foto_url   text,
  ADD COLUMN IF NOT EXISTS latitude   double precision,
  ADD COLUMN IF NOT EXISTS longitude  double precision;

-- Sanidade das coordenadas (aceita NULL; quando preenchidas, dentro do globo).
ALTER TABLE orgao_unidades
  DROP CONSTRAINT IF EXISTS chk_unidade_latlng;
ALTER TABLE orgao_unidades
  ADD CONSTRAINT chk_unidade_latlng CHECK (
    (latitude IS NULL OR (latitude BETWEEN -90 AND 90)) AND
    (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
  );

-- RLS já está habilitado na 040 (app_enable_tenant_rls('orgao_unidades')).
-- Colunas novas herdam a policy existente — nada a fazer aqui.
