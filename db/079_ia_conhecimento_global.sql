-- =====================================================================
-- 079 — Camada de conhecimento GLOBAL da IA (ia_conteudos_global + ia_chunks_global)
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Legislação federal, normas contábeis, manuais de transparência e
-- demais textos que são COMPARTILHADOS POR TODAS AS ENTIDADES (tenants)
-- vivem aqui — e não em `ia_conteudos` (por tenant).
--
-- Exemplos de conteúdo esperado:
--   • Lei nº 14.133/2021 (Nova Lei de Licitações)
--   • Lei nº 101/2000 (LRF)
--   • Código de Defesa do Consumidor (Lei 8.078/1990)
--   • Lei Maria da Penha (Lei 11.340/2006)
--   • LGPD (Lei 13.709/2018)
--   • Lei 8.666/1993 (vigente para contratos em curso)
--   • Manuais do Tesouro Nacional, STN, SICONFI
--   • Normas ABNT de acessibilidade
--   • Constituição Federal — capítulos relevantes à Administração Pública
--
-- Leis/normas MUNICIPAIS (decretos, regimentos, portarias locais) continuam
-- em `ia_conteudos` com `tenant_id`, pois são específicas de cada prefeitura.
--
-- DIFERENÇA DE RLS
-- ----------------
-- Dado de PLATAFORMA — NÃO há tenant_id. O modelo de acesso é:
--   • SELECT: permitido a QUALQUER sessão (bot de cada tenant consulta
--     este acervo ao responder cidadãos, sem precisar de contexto de tenant).
--   • INSERT / UPDATE / DELETE: restrito a sessões com app_is_platform() = true
--     (super_admin da Lidera). Gestores de prefeitura NÃO editam este acervo.
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS para
-- que re-executar a migration não cause erro em nenhum ambiente.
--
-- BASE LEGAL / LGPD
-- -----------------
-- Textos normativos públicos (legislação federal, manuais oficiais).
-- NÃO armazena dados pessoais (PII). Base legal de tratamento:
-- cumprimento de obrigação legal (LGPD art. 7º, II) e interesse legítimo
-- da plataforma na prestação do serviço público (LGPD art. 7º, III).
-- =====================================================================


-- =====================================================================
-- Tabela 1: ia_conteudos_global
-- Corpus textual global da IA: legislação federal, manuais, normas.
-- =====================================================================
CREATE TABLE IF NOT EXISTS ia_conteudos_global (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Domínio temático controlado — usado para filtrar contexto no RAG
  -- (ex.: o bot filtra apenas domínios relevantes à pergunta do cidadão).
  -- Valores esperados: 'licitacao','contabilidade','consumidor','mulher',
  --   'meio_ambiente','animais','transparencia','lgpd','crianca',
  --   'idoso','pcd','cidade' (lista extensível sem ALTER TABLE).
  dominio         text        NOT NULL,

  -- Subtipo do documento dentro do domínio (ex.: 'lei','resumo','manual',
  -- 'jurisprudencia','resolucao'). Nullable — não é campo controlado.
  categoria       text,

  -- Referência normativa legível (ex.: 'Lei nº 14.133/2021').
  -- Nullable para manuais/guias sem numeração de lei.
  lei_referencia  text,

  -- URL do documento original no portal oficial
  -- (ex.: 'https://www.planalto.gov.br/ccivil_03/leis/L8666.htm').
  -- Nullable para conteúdo sem fonte digital rastreável.
  fonte_url       text,

  titulo          text        NOT NULL,

  -- Corpo principal (markdown ou plain text). Tamanho arbitrário;
  -- o worker de IA realiza chunking antes de gerar embeddings em
  -- ia_chunks_global.
  conteudo        text        NOT NULL,

  -- Rótulos livres para filtragem/busca no console da plataforma.
  tags            text[]      NOT NULL DEFAULT '{}',

  ativo           boolean     NOT NULL DEFAULT true,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  -- Vetor de busca full-text em português GENERATED ALWAYS.
  -- Composto por título + conteúdo para máxima cobertura léxica.
  -- Indexado com GIN abaixo.
  busca           tsvector GENERATED ALWAYS AS (
                    to_tsvector(
                      'portuguese',
                      coalesce(titulo,   '') || ' ' ||
                      coalesce(conteudo, '')
                    )
                  ) STORED
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE ia_conteudos_global IS
  'Corpus textual GLOBAL da IA: legislação federal, normas contábeis e manuais '
  'compartilhados por TODAS as entidades (tenants). Gravável somente pelo '
  'super_admin Lidera (app_is_platform()). Leis municipais ficam em ia_conteudos '
  '(por tenant). Sem PII; base legal: LGPD art. 7º II e III.';

COMMENT ON COLUMN ia_conteudos_global.dominio IS
  'Domínio temático do conteúdo. Exemplos: licitacao, contabilidade, consumidor, '
  'mulher, meio_ambiente, animais, transparencia, lgpd, crianca, idoso, pcd, cidade. '
  'Usado pelo RAG para filtrar contexto relevante à consulta.';

COMMENT ON COLUMN ia_conteudos_global.categoria IS
  'Subtipo dentro do domínio (ex.: lei, resumo, manual, resolucao). Nullable.';

COMMENT ON COLUMN ia_conteudos_global.lei_referencia IS
  'Identificação normativa legível (ex.: "Lei nº 14.133/2021"). '
  'Nullable para manuais e guias sem numeração oficial.';

COMMENT ON COLUMN ia_conteudos_global.fonte_url IS
  'URL do documento no portal oficial (Planalto, Tesouro Nacional, STN etc.). '
  'Nullable quando não há fonte digital rastreável.';

COMMENT ON COLUMN ia_conteudos_global.conteudo IS
  'Corpo do documento em markdown ou plain text. Tamanho arbitrário; o worker '
  'de IA realiza chunking antes de gerar embeddings. NÃO armazenar PII.';

COMMENT ON COLUMN ia_conteudos_global.tags IS
  'Rótulos livres para filtragem e busca no console da plataforma.';

COMMENT ON COLUMN ia_conteudos_global.busca IS
  'tsvector em português GENERATED ALWAYS: título + conteúdo. '
  'Indexado com GIN; usado pelo RAG léxico (camada 2) e pelo console da plataforma.';

-- ---------------------------------------------------------------------
-- Índices — ia_conteudos_global
-- ---------------------------------------------------------------------

-- Busca full-text principal (GIN em tsvector gerado).
CREATE INDEX IF NOT EXISTS idx_ia_conteudos_global_busca
  ON ia_conteudos_global USING gin (busca);

-- Filtro do RAG e do console da plataforma: listar conteúdos ativos
-- por domínio (ex.: WHERE dominio = 'licitacao' AND ativo = true).
CREATE INDEX IF NOT EXISTS idx_ia_conteudos_global_dominio_ativo
  ON ia_conteudos_global (dominio, ativo);

-- ---------------------------------------------------------------------
-- RLS — padrão "dado de plataforma" (sem tenant_id)
-- ---------------------------------------------------------------------
-- Política dual:
--   1. leitura_global  → qualquer sessão pode ler (SELECT USING true).
--      O bot de cada tenant lê este acervo dentro da transação de tenant
--      sem precisar de modo plataforma — é intencionalmente público para
--      leitura.
--   2. escrita_global  → somente sessão com app_is_platform() = true pode
--      INSERT/UPDATE/DELETE (super_admin Lidera via console da plataforma).
--
-- Postgres avalia policies do mesmo comando com OR, portanto:
--   • SELECT  → leitura_global (USING true) | always passes
--   • INSERT/UPDATE/DELETE → somente escrita_global (app_is_platform())
-- FORCE ROW LEVEL SECURITY garante que o table owner também seja barrado
-- quando conectado sem modo plataforma.
-- ---------------------------------------------------------------------
ALTER TABLE ia_conteudos_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_conteudos_global FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leitura_global ON ia_conteudos_global;
CREATE POLICY leitura_global ON ia_conteudos_global
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS escrita_global ON ia_conteudos_global;
CREATE POLICY escrita_global ON ia_conteudos_global
  FOR ALL
  USING      (app_is_platform())
  WITH CHECK (app_is_platform());

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ia_conteudos_global_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ia_conteudos_global_atualizado_em ON ia_conteudos_global;
CREATE TRIGGER tg_ia_conteudos_global_atualizado_em
  BEFORE UPDATE ON ia_conteudos_global
  FOR EACH ROW EXECUTE FUNCTION trg_ia_conteudos_global_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs — ia_conteudos_global
-- ---------------------------------------------------------------------
-- portal_app (role da API NestJS): CRUD completo; a policy RLS restringe
--   escritas a sessões com app_is_platform() em tempo de execução.
-- portal_ro  (leitura externa / DPO / relatórios): apenas SELECT.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ia_conteudos_global TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON ia_conteudos_global TO portal_ro';
  END IF;
END;
$$;


-- =====================================================================
-- Tabela 2: ia_chunks_global
-- Corpus vetorial global do RAG semântico: chunks + embeddings de
-- ia_conteudos_global. Espelha ia_chunks (054) sem tenant_id.
-- =====================================================================
CREATE TABLE IF NOT EXISTS ia_chunks_global (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Discriminador da fonte. Para esta tabela sempre 'conteudo_global';
  -- reservamos o campo para consistência com ia_chunks e para eventuais
  -- fontes futuras (ex.: 'manual_tcemt', 'norma_abnt').
  fonte      text        NOT NULL DEFAULT 'conteudo_global',

  -- Referência ao artigo de origem em ia_conteudos_global.
  -- ON DELETE CASCADE: apagar o artigo remove todos os seus chunks,
  -- evitando chunks órfãos que inflariam as buscas semânticas.
  ref_id     uuid        NOT NULL
               REFERENCES ia_conteudos_global(id) ON DELETE CASCADE,

  -- Posição do chunk dentro do artigo (0-based). Junto com fonte+ref_id
  -- forma chave única — permite reindexação parcial idempotente.
  chunk_idx  int         NOT NULL,

  -- Metadados herdados do artigo original para exibição no resultado RAG.
  titulo     text,
  url        text,       -- espelha fonte_url de ia_conteudos_global

  -- Texto do chunk (segmento do conteúdo após o chunking do worker).
  texto      text        NOT NULL,

  -- Embedding gerado pelo modelo de linguagem (Voyage-3 / 1024 dims).
  -- Nullable: chunks são inseridos antes do embedding ser gerado pelo worker
  -- assíncrono; HNSW ignora NULLs.
  embedding  vector(1024),

  criado_em  timestamptz NOT NULL DEFAULT now(),

  -- Unicidade garante idempotência no reindex: o worker pode fazer
  -- INSERT … ON CONFLICT (fonte, ref_id, chunk_idx) DO UPDATE SET …
  UNIQUE (fonte, ref_id, chunk_idx)
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE ia_chunks_global IS
  'Corpus vetorial GLOBAL do RAG semântico (camada 4): chunks + embeddings '
  'gerados a partir de ia_conteudos_global. Sem tenant_id — compartilhado '
  'por todas as entidades. Reindexável pelo worker de IA da plataforma.';

COMMENT ON COLUMN ia_chunks_global.fonte IS
  'Discriminador da fonte de origem. Valor padrão: "conteudo_global". '
  'Reservado para suporte a fontes futuras sem ALTER TABLE.';

COMMENT ON COLUMN ia_chunks_global.ref_id IS
  'UUID do registro em ia_conteudos_global que originou este chunk. '
  'ON DELETE CASCADE: apagar o artigo remove todos os chunks relacionados.';

COMMENT ON COLUMN ia_chunks_global.chunk_idx IS
  'Índice do chunk dentro do artigo (0-based). Junto com fonte+ref_id '
  'forma chave única para reindexação idempotente.';

COMMENT ON COLUMN ia_chunks_global.texto IS
  'Segmento de texto gerado pelo worker de chunking a partir de ia_conteudos_global.conteudo.';

COMMENT ON COLUMN ia_chunks_global.embedding IS
  'Vetor de embedding (Voyage-3, 1024 dims). Nullable — preenchido pelo '
  'worker assíncrono após o INSERT inicial. Índice HNSW ignora NULLs.';

-- ---------------------------------------------------------------------
-- Índices — ia_chunks_global
-- ---------------------------------------------------------------------

-- Índice ANN por similaridade de cosseno (HNSW — pgvector >= 0.5).
-- Segue exatamente o mesmo padrão de idx_ia_chunks_embedding (054).
-- m=16, ef_construction=64 são os defaults do pgvector; ajuste em
-- produção se o volume de vetores globais justificar m=32.
CREATE INDEX IF NOT EXISTS idx_ia_chunks_global_embedding
  ON ia_chunks_global USING hnsw (embedding vector_cosine_ops);

-- Índice para busca por artigo de origem (usado pelo worker de reindex
-- e para limpeza de chunks antes de regenerar embeddings de um artigo).
CREATE INDEX IF NOT EXISTS idx_ia_chunks_global_fonte_ref
  ON ia_chunks_global (fonte, ref_id);

-- ---------------------------------------------------------------------
-- RLS — padrão "dado de plataforma" (sem tenant_id)
-- ---------------------------------------------------------------------
-- Mesma lógica de ia_conteudos_global: leitura livre, escrita restrita
-- ao super_admin Lidera (app_is_platform()).
-- ---------------------------------------------------------------------
ALTER TABLE ia_chunks_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_chunks_global FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leitura_global ON ia_chunks_global;
CREATE POLICY leitura_global ON ia_chunks_global
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS escrita_global ON ia_chunks_global;
CREATE POLICY escrita_global ON ia_chunks_global
  FOR ALL
  USING      (app_is_platform())
  WITH CHECK (app_is_platform());

-- ---------------------------------------------------------------------
-- GRANTs — ia_chunks_global
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ia_chunks_global TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON ia_chunks_global TO portal_ro';
  END IF;
END;
$$;


-- =====================================================================
-- BLOCO DE VERIFICAÇÃO (comentado — executar manualmente no ambiente
-- de teste com o container PostGIS na porta 5433)
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: ativar modo plataforma (super_admin Lidera)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- -----------------------------------------------------------------------
-- INSERÇÃO — seed de exemplo (modo plataforma ativo)
-- -----------------------------------------------------------------------
INSERT INTO ia_conteudos_global
  (dominio, categoria, lei_referencia, fonte_url, titulo, conteudo, tags)
VALUES
  ('licitacao', 'lei', 'Lei nº 14.133/2021',
   'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm',
   'Nova Lei de Licitações e Contratos Administrativos',
   'Art. 1º Esta Lei estabelece normas gerais de licitação e contratação '
   'para as Administrações Públicas diretas, autárquicas e fundacionais da '
   'União, dos Estados, do Distrito Federal e dos Municípios...',
   ARRAY['licitacao','contratos','lei 14133','administracao publica']),

  ('lgpd', 'lei', 'Lei nº 13.709/2018',
   'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm',
   'Lei Geral de Proteção de Dados Pessoais (LGPD)',
   'Art. 1º Esta Lei dispõe sobre o tratamento de dados pessoais, inclusive '
   'nos meios digitais, por pessoa natural ou por pessoa jurídica de direito '
   'público ou privado...',
   ARRAY['lgpd','dados pessoais','privacidade','lei 13709']),

  ('contabilidade', 'manual', NULL,
   'https://www.tesouronacional.gov.br/contabilidade-publica/manuais',
   'Manual de Contabilidade Aplicada ao Setor Público (MCASP)',
   'O MCASP consolida as normas de contabilidade pública aplicáveis a todos '
   'os entes da Federação conforme a convergência às normas internacionais...',
   ARRAY['contabilidade','mcasp','tesouro nacional','siconfi']);

-- -----------------------------------------------------------------------
-- TESTE 1: sessão de tenant lê o acervo global (espera 3)
-- A sessão simula um bot de tenant consultando legislação federal.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',                         true);
  PERFORM set_config('app.current_tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
END $$;

SELECT count(*) AS deve_ser_3_tenant_le FROM ia_conteudos_global;

-- -----------------------------------------------------------------------
-- TESTE 2: sessão de tenant NÃO consegue inserir (espera erro de policy)
-- -----------------------------------------------------------------------
-- Descomente para testar; deve falhar com "new row violates row-level security".
-- INSERT INTO ia_conteudos_global (dominio, titulo, conteudo)
-- VALUES ('teste', 'Título bloqueado', 'Conteúdo bloqueado');

-- -----------------------------------------------------------------------
-- TESTE 3: sessão sem tenant também lê (espera 3 — SELECT USING true)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_3_sem_tenant FROM ia_conteudos_global;

-- -----------------------------------------------------------------------
-- TESTE 4: modo plataforma grava chunk (espera sucesso)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

INSERT INTO ia_chunks_global (fonte, ref_id, chunk_idx, titulo, texto)
SELECT
  'conteudo_global',
  id,
  0,
  titulo,
  substring(conteudo, 1, 500)
FROM ia_conteudos_global
WHERE dominio = 'licitacao';

SELECT count(*) AS deve_ser_1_chunk FROM ia_chunks_global;

-- -----------------------------------------------------------------------
-- TESTE 5: ON DELETE CASCADE remove chunk ao apagar o artigo
-- -----------------------------------------------------------------------
DELETE FROM ia_conteudos_global WHERE dominio = 'licitacao';
SELECT count(*) AS deve_ser_0_chunks_orfaos FROM ia_chunks_global
 WHERE fonte = 'conteudo_global';

-- -----------------------------------------------------------------------
-- TESTE 6: busca full-text em português
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT titulo
  FROM ia_conteudos_global
 WHERE busca @@ to_tsquery('portuguese', 'proteção & dados');
-- Espera: 'Lei Geral de Proteção de Dados Pessoais (LGPD)'

-- -----------------------------------------------------------------------
-- TESTE 7: filtro por domínio + ativo (índice composto)
-- -----------------------------------------------------------------------
SELECT titulo
  FROM ia_conteudos_global
 WHERE dominio = 'contabilidade'
   AND ativo   = true;
-- Espera: 'Manual de Contabilidade Aplicada ao Setor Público (MCASP)'

-- -----------------------------------------------------------------------
-- TESTE 8: trigger atualizado_em
-- -----------------------------------------------------------------------
UPDATE ia_conteudos_global
   SET titulo = titulo || ' (revisado)'
 WHERE dominio = 'lgpd';

SELECT titulo, atualizado_em
  FROM ia_conteudos_global
 WHERE dominio = 'lgpd';
-- Espera: atualizado_em com valor de now() recente

-- -----------------------------------------------------------------------
-- TESTE 9: verificar índices no catálogo
-- -----------------------------------------------------------------------
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename IN ('ia_conteudos_global', 'ia_chunks_global')
 ORDER BY tablename, indexname;
-- Espera:
--   ia_chunks_global: idx_ia_chunks_global_embedding (hnsw), idx_ia_chunks_global_fonte_ref
--   ia_conteudos_global: idx_ia_conteudos_global_busca (gin), idx_ia_conteudos_global_dominio_ativo

-- -----------------------------------------------------------------------
-- TESTE 10: verificar policies RLS no catálogo
-- -----------------------------------------------------------------------
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE tablename IN ('ia_conteudos_global', 'ia_chunks_global')
 ORDER BY tablename, policyname;
-- Espera: leitura_global (SELECT, qual=true) + escrita_global (ALL, qual=app_is_platform())
-- para cada tabela.

-- -----------------------------------------------------------------------
-- Limpeza
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM ia_conteudos_global;   -- CASCADE remove ia_chunks_global também

*/
