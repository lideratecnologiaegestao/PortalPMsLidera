-- =====================================================================
-- 060 — Índice unificado de busca full-text (ADR-0004)
-- =====================================================================
-- `search_index` é o índice desnormalizado que alimenta o buscador
-- global do portal. Cada linha representa um item pesquisável de
-- qualquer módulo (notícia, documento, serviço, diário, CMS etc.).
--
-- Responsabilidades de cada camada:
--   INDEXAÇÃO (app)  — o worker de indexação é o único que grava/
--                      atualiza linhas; aplica as regras de visibilidade
--                      (publicado, ativo, não-rascunho) e de LGPD
--                      (anonimização, supressão de dados pessoais) antes
--                      de gravar em `corpo_tsv` e `snippet_src`.
--                      Linhas não-publicadas simplesmente não entram.
--
--   ISOLAMENTO (RLS) — `app_enable_tenant_rls` garante que uma sessão
--                      de tenant A jamais enxerga linhas de tenant B,
--                      independentemente da query feita pelo app.
--
-- Sem trigger nesta migration: a atualização de `atualizado_em` e a
-- geração de `corpo_tsv` são responsabilidade do worker de indexação,
-- mantendo a migration simples e o schema livre de dependências de
-- configuração textual (dicionário, pesos) que podem mudar por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS search_index (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Tipo da entidade-origem. Conjunto fechado validado pelo app.
  tipo         text        NOT NULL,
  -- CHECK garante que valores inesperados nunca entram no índice.
  CONSTRAINT ck_search_tipo CHECK (tipo IN (
    'noticia', 'documento', 'diario', 'servico', 'secretaria',
    'cms', 'transparencia', 'licitacao', 'contrato',
    'convenio', 'conselho', 'concurso'
  )),

  -- Identificador da entidade de origem (UUID ou slug, como string).
  ref_id       text        NOT NULL,

  titulo       text        NOT NULL,
  subtitulo    text,                       -- olde/subtítulo, ementa, categoria…

  -- URL canônica pública do item (caminho relativo ou absoluto).
  url          text        NOT NULL,

  -- Vetor pré-computado pelo worker (to_tsvector('portuguese', …)).
  -- Indexado com GIN para busca @@ eficiente.
  corpo_tsv    tsvector    NOT NULL,

  -- Texto plano pré-recortado para ts_headline (max ~2000 chars).
  -- O app é responsável por cortar antes de gravar; armazenado aqui
  -- para evitar re-leitura das tabelas de origem no momento da busca.
  snippet_src  text,

  -- Peso do item no ranking (default 1.0). Pode ser ajustado pelo
  -- worker para boostar conteúdos fixados, destaques etc.
  peso         real        NOT NULL DEFAULT 1.0,

  publicado_em  timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- Garante idempotência no worker: upsert por (tenant, tipo, ref_id).
  UNIQUE (tenant_id, tipo, ref_id)
);

COMMENT ON TABLE search_index IS
  'Índice desnormalizado do buscador global. '
  'Cada linha é um item pesquisável de qualquer módulo. '
  'Visibilidade/LGPD filtrados na indexação (worker); isolamento por RLS.';

COMMENT ON COLUMN search_index.tipo IS
  'Origem do item: noticia|documento|diario|servico|secretaria|'
  'cms|transparencia|licitacao|contrato|convenio|conselho|concurso';

COMMENT ON COLUMN search_index.ref_id IS
  'ID (uuid como text, slug ou código) da entidade na tabela de origem.';

COMMENT ON COLUMN search_index.corpo_tsv IS
  'tsvector em português gerado pelo worker de indexação. '
  'Recomenda-se compor: setweight(to_tsvector(''portuguese'', titulo), ''A'') '
  '|| setweight(to_tsvector(''portuguese'', coalesce(subtitulo, '''')), ''B'') '
  '|| setweight(to_tsvector(''portuguese'', coalesce(trecho_do_corpo, '''')), ''C'').';

COMMENT ON COLUMN search_index.snippet_src IS
  'Texto plano pré-recortado (max ~2000 chars) para ts_headline. '
  'O app é responsável por truncar antes de gravar; sem geração automática aqui.';

COMMENT ON COLUMN search_index.peso IS
  'Fator de boost no ranking (1.0 = neutro). '
  'O worker pode elevar para destaques, fixados etc.';

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- Busca full-text principal (GIN em tsvector).
CREATE INDEX IF NOT EXISTS idx_search_corpo
  ON search_index USING gin (corpo_tsv);

-- Fuzzy por título via trigramas (autocomplete, typos, busca parcial).
-- Requer pg_trgm (criado em 001).
CREATE INDEX IF NOT EXISTS idx_search_titulo_trgm
  ON search_index USING gin (titulo gin_trgm_ops);

-- Filtro padrão: tenant + tipo + ordenação por data de publicação DESC.
-- Cobre queries como: WHERE tenant_id = ? AND tipo = ? ORDER BY publicado_em DESC
CREATE INDEX IF NOT EXISTS idx_search_tenant
  ON search_index (tenant_id, tipo, publicado_em DESC);

-- ---------------------------------------------------------------------
-- Row Level Security — isolamento por tenant (padrão da plataforma).
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('search_index');
