-- =====================================================================
-- 098 — Documentos legais versionados + fixar itens do menu "A Prefeitura"
-- =====================================================================
-- (1) Cadastro dedicado e VERSIONADO de 3 documentos legais por tenant:
--     Política de Acessibilidade, Privacidade (LGPD) e Aviso de Cookies.
--     `documentos_legais` guarda a versão vigente (1 linha por tenant+tipo);
--     `documentos_legais_versoes` guarda o histórico (snapshot a cada salvar).
-- (2) Backfill: garante os itens institucionais no menu "A Prefeitura"
--     (cabeçalho) para os tenants JÁ existentes — novos tenants já nascem com
--     eles via semeiarMenus. (Os links legais ficam fixos no rodapé, no próprio
--     componente, para todos os tenants.)
-- =====================================================================

-- ── (1) Documentos legais (vigente) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_legais (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo          text NOT NULL,                 -- 'acessibilidade' | 'privacidade' | 'cookies'
  titulo        text,
  conteudo      text NOT NULL DEFAULT '',
  formato       text NOT NULL DEFAULT 'html',  -- 'html' | 'md'
  versao        integer NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tipo),
  CONSTRAINT chk_doc_legal_tipo    CHECK (tipo IN ('acessibilidade','privacidade','cookies')),
  CONSTRAINT chk_doc_legal_formato CHECK (formato IN ('html','md'))
);
SELECT app_enable_tenant_rls('documentos_legais');

-- ── (1) Histórico de versões ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_legais_versoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo       text NOT NULL,
  versao     integer NOT NULL,
  titulo     text,
  conteudo   text NOT NULL DEFAULT '',
  formato    text NOT NULL DEFAULT 'html',
  criado_por uuid REFERENCES users(id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_legal_versao ON documentos_legais_versoes (tenant_id, tipo, versao DESC);
SELECT app_enable_tenant_rls('documentos_legais_versoes');

-- ── (2) Backfill do menu "A Prefeitura" para tenants existentes ──────
-- Roda como superusuário (RLS ignorada) → enxerga todos os tenants.

-- 2a. Garante refTipo no grupo "A Prefeitura".
UPDATE menu_items SET ref_tipo = 'a_prefeitura_root'
WHERE local = 'cabecalho' AND tipo = 'grupo' AND lower(label) = 'a prefeitura' AND ref_tipo IS NULL;

-- 2b. Marca o item "Estrutura Organizacional" já semeado (sem refTipo) com refTipo.
UPDATE menu_items m SET ref_tipo = 'estrutura_page'
WHERE m.local = 'cabecalho' AND m.href = '/institucional/estrutura' AND m.ref_tipo IS NULL
  AND EXISTS (SELECT 1 FROM menu_items g WHERE g.id = m.parent_id AND g.ref_tipo = 'a_prefeitura_root');

-- 2c. Insere os itens institucionais que faltarem (idempotente por refTipo).
INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, icone, ordem, ativo, ref_tipo)
SELECT g.tenant_id, 'cabecalho', g.id, i.label, 'interno', i.href, i.icone, i.ordem, true, i.ref_tipo
FROM menu_items g
CROSS JOIN (VALUES
  ('prefeito_page',     'O Prefeito(a)',           '/institucional/prefeito',      0, 'user'),
  ('vice_page',         'Vice-Prefeito(a)',        '/institucional/vice-prefeito', 1, 'user'),
  ('ex_prefeitos_page', 'Galeria de Ex-Prefeitos', '/institucional/ex-prefeitos',  2, 'photo'),
  ('historia_page',     'História do Município',   '/institucional/historia',      3, 'pages'),
  ('hino_brasao_page',  'Hino e Brasão',           '/institucional/hino-brasao',   4, 'pages'),
  ('estrutura_page',    'Estrutura Organizacional','/institucional/estrutura',     5, 'building')
) AS i(ref_tipo, label, href, ordem, icone)
WHERE g.local = 'cabecalho' AND g.tipo = 'grupo' AND g.ref_tipo = 'a_prefeitura_root'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items m
    WHERE m.tenant_id = g.tenant_id AND m.local = 'cabecalho' AND m.ref_tipo = i.ref_tipo
  );
