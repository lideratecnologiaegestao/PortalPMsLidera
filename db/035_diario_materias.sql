-- =====================================================================
-- 035 — Diário Oficial 2.0: matérias estruturadas + busca full-text
-- =====================================================================
-- Evolui o Diário de "edição = 1 bloco de texto" para "edição = coleção de
-- MATÉRIAS" (atos individuais: leis, decretos, portarias, editais, extratos,
-- atos de pessoal…), cada uma classificada por tipo e órgão, com permalink e
-- busca textual em português (tsvector + GIN).
--
-- Mantém o que já é forte: assinatura ICP-Brasil + imutabilidade + hash. As
-- matérias de uma edição publicada também ficam imutáveis (trigger espelhado).
-- =====================================================================

-- ── Colunas novas na edição ──────────────────────────────────────────
ALTER TABLE diario_edicoes
  ADD COLUMN IF NOT EXISTS tipo_edicao   text NOT NULL DEFAULT 'ordinaria',  -- ordinaria|extra|suplementar
  ADD COLUMN IF NOT EXISTS suplemento_de uuid REFERENCES diario_edicoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_seq    integer,            -- numeração sequencial automática (por tenant)
  ADD COLUMN IF NOT EXISTS total_paginas integer;

-- numeração sequencial única por tenant (quando preenchida)
CREATE UNIQUE INDEX IF NOT EXISTS uq_diario_numero_seq
  ON diario_edicoes (tenant_id, numero_seq) WHERE numero_seq IS NOT NULL;

-- Busca full-text na própria edição (cobre conteúdo legado / edição sem matérias).
-- Usa a config 'portuguese' (imutável) — necessário para coluna gerada.
ALTER TABLE diario_edicoes
  ADD COLUMN IF NOT EXISTS busca tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(titulo, '') || ' ' ||
      regexp_replace(coalesce(conteudo, ''), '<[^>]+>', ' ', 'g'))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_diario_busca ON diario_edicoes USING gin (busca);

-- ── Matérias (atos individuais) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS diario_materias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  edicao_id     uuid NOT NULL REFERENCES diario_edicoes(id) ON DELETE CASCADE,
  secretaria_id uuid REFERENCES secretarias(id) ON DELETE SET NULL,  -- órgão cadastrado
  orgao_nome    text,                       -- órgão livre (ex.: "Câmara Municipal", "Fundo Mun. de Saúde")
  tipo          text NOT NULL DEFAULT 'outro', -- lei|decreto|portaria|edital|extrato_contrato|ato_pessoal|aviso|resolucao|licitacao|outro
  numero_ato    text,                       -- ex.: "Lei nº 1.234/2026"
  titulo        text NOT NULL,
  ementa        text,
  conteudo      text NOT NULL DEFAULT '',    -- HTML
  ordem         integer NOT NULL DEFAULT 0,
  pagina_inicial integer,                    -- página na edição (preenchida na geração do PDF)
  retifica_materia_id uuid REFERENCES diario_materias(id) ON DELETE SET NULL, -- retifica outra matéria
  busca         tsvector
    GENERATED ALWAYS AS (
      to_tsvector('portuguese',
        coalesce(titulo, '')     || ' ' ||
        coalesce(ementa, '')     || ' ' ||
        coalesce(numero_ato, '') || ' ' ||
        coalesce(orgao_nome, '') || ' ' ||
        regexp_replace(coalesce(conteudo, ''), '<[^>]+>', ' ', 'g'))
    ) STORED,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materia_edicao ON diario_materias (tenant_id, edicao_id, ordem);
CREATE INDEX IF NOT EXISTS idx_materia_tipo   ON diario_materias (tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_materia_orgao  ON diario_materias (tenant_id, secretaria_id);
CREATE INDEX IF NOT EXISTS idx_materia_busca  ON diario_materias USING gin (busca);
SELECT app_enable_tenant_rls('diario_materias');

-- Imutabilidade espelhada: matéria de edição PUBLICADA não pode ser
-- inserida/alterada. DELETE não é blocado (offboarding via cascade; a app não
-- expõe exclusão de matéria publicada).
CREATE OR REPLACE FUNCTION diario_materia_bloqueia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  st diario_status;
BEGIN
  SELECT status INTO st FROM diario_edicoes WHERE id = NEW.edicao_id;
  IF st = 'publicado' THEN
    RAISE EXCEPTION 'Edição publicada do Diário Oficial é imutável (matérias não podem ser alteradas).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_materia_imutavel
  BEFORE INSERT OR UPDATE ON diario_materias
  FOR EACH ROW EXECUTE FUNCTION diario_materia_bloqueia();
