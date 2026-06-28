-- =====================================================================
-- 094 — Cadastro de Prefeitos (titular, vice e ex-prefeitos)
-- =====================================================================
-- Cadastro dedicado da chefia do Executivo, com gênero (para rotular
-- "O Prefeito" / "A Prefeita"), mandatos e história. Alimenta a página pública
-- "A Prefeitura → O Prefeito(a)" (titular atual + vice) e a galeria de
-- ex-prefeitos (mural com foto, mandatos e breve história ao clicar).
--
-- Independe de gabinete_autoridades (que segue alimentando o organograma da
-- Estrutura). Aqui o foco é a página biográfica e a galeria histórica.
-- =====================================================================

CREATE TABLE IF NOT EXISTS prefeitos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo           text NOT NULL DEFAULT 'prefeito',   -- 'prefeito' | 'vice'
  nome           text NOT NULL,
  genero         text NOT NULL DEFAULT 'masculino',  -- 'masculino' | 'feminino'
  partido        text,
  foto_url       text,
  mandato_inicio integer,                            -- ano (ex.: 2021)
  mandato_fim    integer,                            -- ano (NULL = em exercício)
  atual          boolean NOT NULL DEFAULT false,     -- titular atual (topo da página)
  resumo         text,                               -- linha curta
  historia       text,                               -- biografia/história (HTML)
  email          text,
  telefone       text,
  ordem          integer NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_prefeito_tipo   CHECK (tipo IN ('prefeito','vice')),
  CONSTRAINT chk_prefeito_genero CHECK (genero IN ('masculino','feminino'))
);
CREATE INDEX IF NOT EXISTS idx_prefeito_tenant ON prefeitos (tenant_id, tipo, atual, mandato_inicio);
SELECT app_enable_tenant_rls('prefeitos');

-- atualizado_em automático
CREATE OR REPLACE FUNCTION trg_prefeitos_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_prefeitos_atualizado_em ON prefeitos;
CREATE TRIGGER tg_prefeitos_atualizado_em
  BEFORE UPDATE ON prefeitos
  FOR EACH ROW EXECUTE FUNCTION trg_prefeitos_atualizado_em();
