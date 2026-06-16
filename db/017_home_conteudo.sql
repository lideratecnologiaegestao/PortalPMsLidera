-- =====================================================================
-- 017 — Conteúdo dinâmico da home: banners, notícias e colunas extras
--        em secretarias (foto_url, descricao)
-- =====================================================================
-- Depende: 001 (app_enable_tenant_rls, tenants), 002 (secretarias),
--          001 (pg_trgm — gin_trgm_ops)
-- Idempotente: usa CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--              e DROP/CREATE POLICY em bloco de exceção (policy pode já
--              existir se a migration for reaplicada parcialmente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BANNERS — carrossel / hero da home
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS banners (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo      text,
  subtitulo   text,
  imagem_url  text,           -- URL mascarada (/midia/...) ou externa
  link_url    text,
  cta_label   text,           -- rótulo do botão ("Saiba mais")
  ordem       integer     NOT NULL DEFAULT 0,
  ativo       boolean     NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Índice composto para a query mais comum: banners ativos ordenados por posição
CREATE INDEX IF NOT EXISTS idx_banners_tenant_ativo_ordem
  ON banners (tenant_id, ativo, ordem);

SELECT app_enable_tenant_rls('banners');

-- ---------------------------------------------------------------------
-- 2. NOTICIAS — notícias / imprensa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noticias (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug           citext      NOT NULL,
  titulo         text        NOT NULL,
  resumo         text,
  conteudo       text,
  imagem_url     text,
  categoria      text,
  autor          text,
  publicado      boolean     NOT NULL DEFAULT false,
  publicado_em   timestamptz,
  visualizacoes  integer     NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- Índice para listagem paginada de notícias publicadas (mais recente primeiro)
CREATE INDEX IF NOT EXISTS idx_noticias_tenant_pub_data
  ON noticias (tenant_id, publicado, publicado_em DESC);

-- Índice GIN para busca full-text fuzzy no título
CREATE INDEX IF NOT EXISTS idx_noticias_titulo_trgm
  ON noticias USING gin (titulo gin_trgm_ops);

SELECT app_enable_tenant_rls('noticias');

-- ---------------------------------------------------------------------
-- 3. SECRETARIAS — adicionar colunas (tabela já existe com RLS ativo)
-- ---------------------------------------------------------------------
ALTER TABLE secretarias
  ADD COLUMN IF NOT EXISTS foto_url  text,   -- foto do(a) secretário(a)
  ADD COLUMN IF NOT EXISTS descricao text;   -- texto de apresentação da secretaria

-- Não é necessário recriar RLS: ALTER TABLE não afeta policies existentes.
-- Não é necessário recriar índices: as colunas novas são de texto livre,
-- sem filtros frequentes por elas isoladas.

-- ---------------------------------------------------------------------
-- GRANTs explícitos (complemento ao ALTER DEFAULT PRIVILEGES do setup)
-- Garante acesso mesmo em ambientes onde o superusuário criou as tabelas
-- fora do contexto do role portal_app.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- banners
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON banners TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON banners TO portal_ro';
  END IF;

  -- noticias
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON noticias TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON noticias TO portal_ro';
  END IF;
END;
$$;
