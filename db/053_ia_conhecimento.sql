-- =====================================================================
-- 053 — Base de conhecimento do assistente de IA (por tenant)
-- =====================================================================
-- "Treinar" o chatbot: o gestor cadastra perguntas frequentes / respostas
-- oficiais / fatos que o bot prioriza. Multi-tenant + RLS — cada entidade
-- ensina o seu próprio bot. Busca full-text em português.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ia_conhecimento (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pergunta      text        NOT NULL,          -- pergunta/título do conhecimento
  resposta      text        NOT NULL,          -- resposta oficial
  tags          text[]      NOT NULL DEFAULT '{}',
  fixado        boolean     NOT NULL DEFAULT false, -- sempre injetado no contexto (fato essencial)
  ativo         boolean     NOT NULL DEFAULT true,
  criado_por    uuid        REFERENCES users(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  busca         tsvector GENERATED ALWAYS AS (
                  to_tsvector('portuguese', coalesce(pergunta,'') || ' ' || coalesce(resposta,''))
                ) STORED
);

COMMENT ON TABLE  ia_conhecimento        IS 'Base de conhecimento curada do assistente de IA, por tenant. O gestor "treina" o bot com perguntas/respostas/fatos. Fixados são sempre injetados no contexto.';
COMMENT ON COLUMN ia_conhecimento.fixado IS 'true = sempre incluído no contexto do bot (fato essencial, ex.: identidade da prefeitura).';

CREATE INDEX IF NOT EXISTS idx_ia_conhecimento_busca ON ia_conhecimento USING gin (busca);
CREATE INDEX IF NOT EXISTS idx_ia_conhecimento_tenant ON ia_conhecimento (tenant_id, ativo);

SELECT app_enable_tenant_rls('ia_conhecimento');
