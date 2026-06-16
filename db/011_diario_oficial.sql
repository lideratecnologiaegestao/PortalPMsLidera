-- =====================================================================
-- 011 — Diário Oficial do Município (validade jurídica)
-- =====================================================================
-- Validade exige assinatura digital ICP-Brasil, carimbo de tempo e
-- IMUTABILIDADE após a publicação. O hash (SHA-256 do conteúdo canônico) é
-- calculado na aplicação; a imutabilidade é garantida no banco por trigger.
-- =====================================================================

CREATE TYPE diario_status AS ENUM ('rascunho', 'publicado', 'revogado');

CREATE TABLE diario_edicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero        text NOT NULL,
  data_edicao   date NOT NULL,
  titulo        text NOT NULL,
  conteudo      text NOT NULL DEFAULT '',
  arquivo_key   text,                         -- PDF no object storage (opcional)
  status        diario_status NOT NULL DEFAULT 'rascunho',
  hash          text,                         -- SHA-256 do conteúdo canônico
  assinatura    text,                         -- assinatura ICP-Brasil (ou stub dev)
  algoritmo     text,
  carimbo_tempo timestamptz,                   -- carimbo de tempo
  publicado_em  timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX idx_diario_data ON diario_edicoes (tenant_id, data_edicao DESC);
CREATE INDEX idx_diario_hash ON diario_edicoes (hash);
SELECT app_enable_tenant_rls('diario_edicoes');

-- Imutabilidade: uma edição PUBLICADA não pode ser alterada. A transição
-- rascunho→publicado é permitida (OLD ainda é rascunho). DELETE não é blocado
-- aqui para não travar o cascade de offboarding do tenant; a app não expõe
-- endpoint de exclusão.
CREATE OR REPLACE FUNCTION diario_bloqueia_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'publicado' THEN
    RAISE EXCEPTION 'Edição publicada do Diário Oficial é imutável (não pode ser alterada).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diario_imutavel
  BEFORE UPDATE ON diario_edicoes
  FOR EACH ROW EXECUTE FUNCTION diario_bloqueia_alteracao();
