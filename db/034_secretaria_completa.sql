-- 034_secretaria_completa.sql
-- Reformulação das Secretarias: página completa com seções (sobre, secretário,
-- competências, notícias, galeria, trabalhos, documentos). Sistemas gerais
-- (notícias, galeria, documentos) ganham `secretaria_id` OPCIONAL — o item
-- aparece no portal principal E na página da secretaria (compartilhado).

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Campos ricos da secretaria ───────────────────────────────────────────────
ALTER TABLE secretarias
  ADD COLUMN IF NOT EXISTS sobre          text,   -- HTML (rich text)
  ADD COLUMN IF NOT EXISTS competencias   text,   -- HTML (rich text)
  ADD COLUMN IF NOT EXISTS secretario_bio text,   -- HTML (mini-currículo)
  ADD COLUMN IF NOT EXISTS secretario_cargo text, -- ex.: "Secretário Municipal de Obras"
  ADD COLUMN IF NOT EXISTS endereco       text,
  ADD COLUMN IF NOT EXISTS cep            text,
  ADD COLUMN IF NOT EXISTS horario        text;   -- horário de atendimento

-- ── Notícias vinculadas à secretaria (compartilhadas) ───────────────────────
ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS secretaria_id uuid REFERENCES secretarias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_noticias_secretaria ON noticias (tenant_id, secretaria_id, publicado_em DESC);

-- ── Documentos vinculados à secretaria (compartilhados; motor 028) ──────────
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS secretaria_id uuid REFERENCES secretarias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_secretaria ON documentos (tenant_id, secretaria_id);

-- ── Galeria geral (fotos + vídeos) — compartilhada com a secretaria ─────────
CREATE TABLE IF NOT EXISTS galeria_itens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secretaria_id uuid        REFERENCES secretarias(id) ON DELETE SET NULL,
  tipo          text        NOT NULL DEFAULT 'foto',   -- foto | video
  fonte         text        NOT NULL DEFAULT 'upload',  -- upload | youtube
  titulo        text,
  url           text,                                   -- /midia/... (upload) ou link YouTube
  youtube_id    text,                                   -- id extraído do YouTube (embed)
  storage_key   text,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_galeria_tenant ON galeria_itens (tenant_id, tipo, ordem);
CREATE INDEX IF NOT EXISTS idx_galeria_secretaria ON galeria_itens (tenant_id, secretaria_id, ordem);
SELECT app_enable_tenant_rls('galeria_itens');

-- ── Trabalhos realizados pela secretaria ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS secretaria_trabalhos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secretaria_id uuid        NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  titulo        text        NOT NULL,
  descricao     text,
  imagem_url    text,
  data          date,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sec_trabalhos ON secretaria_trabalhos (tenant_id, secretaria_id, ordem);
SELECT app_enable_tenant_rls('secretaria_trabalhos');
