-- =====================================================================
-- 015 — Carta de Serviços ao Cidadão
-- =====================================================================
-- Catálogo multi-tenant de serviços públicos municipais, conforme exigido
-- pela Lei 13.460/2017 (Carta de Serviços). Cada tenant publica e gerencia
-- sua própria lista de serviços; isolamento via RLS padrão de tenant.
--
-- Modelo: um serviço é a unidade mínima do catálogo — tem título, slug,
-- descrição, categoria, público-alvo, requisitos, etapas (jsonb), canais,
-- prazo, custo e URL externa. O campo `publicado` controla a visibilidade
-- no portal. `ordem` permite reordenação manual dentro da categoria.
-- =====================================================================

CREATE TABLE servicos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo              text        NOT NULL,
  slug                citext      NOT NULL,
  descricao           text,
  categoria           text,                                    -- ex.: 'Saúde', 'Tributos', 'Educação'
  orgao_responsavel   text,
  publico_alvo        text,
  requisitos          text,
  etapas              jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{titulo, descricao}, ...]
  canais_atendimento  text,
  prazo_atendimento   text,
  custo               text,
  url_externa         text,
  publicado           boolean     NOT NULL DEFAULT false,
  ordem               integer     NOT NULL DEFAULT 0,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_servicos_publicado  ON servicos (tenant_id, publicado);
CREATE INDEX idx_servicos_categoria  ON servicos (tenant_id, categoria);

SELECT app_enable_tenant_rls('servicos');
