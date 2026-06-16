-- =====================================================================
-- 005 — App do Cidadão: chamados georreferenciados (PostGIS)
-- =====================================================================
-- Buracos, terrenos abandonados, animais abandonados, iluminação, lixo etc.
-- Cada chamado tem ponto geográfico (geography Point 4326), foto e status.
-- =====================================================================

CREATE TYPE chamado_categoria AS ENUM (
  'buraco_via',
  'terreno_abandonado',
  'animal_abandonado',
  'iluminacao_publica',
  'coleta_lixo',
  'arvore_risco',
  'sinalizacao',
  'outro'
);

CREATE TYPE chamado_status AS ENUM (
  'aberto',
  'triagem',
  'em_atendimento',
  'resolvido',
  'reaberto',
  'cancelado',
  'duplicado'
);

CREATE TABLE chamados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  protocolo     text NOT NULL,
  cidadao_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  categoria     chamado_categoria NOT NULL,
  status        chamado_status NOT NULL DEFAULT 'aberto',
  descricao     text NOT NULL,
  -- georreferência (lat/lng em WGS84)
  geo           geography(Point, 4326) NOT NULL,
  endereco      text,
  bairro        text,
  secretaria_id uuid REFERENCES secretarias(id) ON DELETE SET NULL,
  prioridade    smallint NOT NULL DEFAULT 3,    -- 1 (alta) .. 5 (baixa); IA pode sugerir
  criado_em     timestamptz NOT NULL DEFAULT now(),
  resolvido_em  timestamptz,
  UNIQUE (tenant_id, protocolo)
);
-- índice espacial: clusterizar, buscar "chamados perto daqui", detectar duplicados
CREATE INDEX idx_chamados_geo ON chamados USING gist (geo);
CREATE INDEX idx_chamados_tenant_status ON chamados (tenant_id, status);
SELECT app_enable_tenant_rls('chamados');

CREATE TABLE chamado_fotos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chamado_id  uuid NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  origem      text NOT NULL DEFAULT 'cidadao',  -- cidadao | equipe
  criado_em   timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('chamado_fotos');

CREATE TABLE chamado_atualizacoes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chamado_id  uuid NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  status      chamado_status NOT NULL,
  comentario  text,
  ator_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('chamado_atualizacoes');

-- Exemplo de consulta de duplicados num raio de 30m da mesma categoria:
--   SELECT id FROM chamados
--   WHERE categoria = $1 AND status NOT IN ('resolvido','cancelado','duplicado')
--     AND ST_DWithin(geo, ST_MakePoint($lng,$lat)::geography, 30);
