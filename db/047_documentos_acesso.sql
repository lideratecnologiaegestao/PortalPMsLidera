-- =====================================================================
-- 047 — Categorias hierárquicas e nível de acesso por grupo nos documentos
-- =====================================================================
-- Bloco: SIC / Cadastro de Documentos (aderência TR)
--
--   doc_tipos.parent_id        — taxonomia em ÁRVORE (hierarquia arbitrária)
--   doc_cadastros.visibilidade — 'publico' (todos) | 'restrito' (só grupos)
--   doc_cadastro_grupos        — quais grupos_acesso podem ver um cadastro
--                                restrito (reusa a infra de grupos da migration 046)
--
-- Cadastro restrito: some do menu público e da listagem pública; só é acessível
-- por usuário autenticado que pertença a um grupo permitido (ou staff com a
-- permissão documentos.gerenciar — resolvido na aplicação).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hierarquia de tipos (auto-relação dentro do mesmo cadastro)
-- ---------------------------------------------------------------------
ALTER TABLE doc_tipos
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES doc_tipos(id) ON DELETE SET NULL;

COMMENT ON COLUMN doc_tipos.parent_id IS 'Tipo pai (mesma árvore do cadastro). NULL = nó raiz. Permite taxonomia hierárquica de profundidade arbitrária.';

CREATE INDEX IF NOT EXISTS idx_doc_tipos_parent ON doc_tipos (parent_id);

-- ---------------------------------------------------------------------
-- 2. Visibilidade do cadastro
-- ---------------------------------------------------------------------
ALTER TABLE doc_cadastros
  ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'publico';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doc_cadastros_visibilidade_chk'
  ) THEN
    ALTER TABLE doc_cadastros
      ADD CONSTRAINT doc_cadastros_visibilidade_chk
      CHECK (visibilidade IN ('publico', 'restrito'));
  END IF;
END $$;

COMMENT ON COLUMN doc_cadastros.visibilidade IS 'publico = visível a todos; restrito = visível apenas a usuários de grupos permitidos (doc_cadastro_grupos) e a staff com documentos.gerenciar.';

-- ---------------------------------------------------------------------
-- 3. Grupos permitidos por cadastro restrito
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doc_cadastro_grupos (
  tenant_id   uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  cadastro_id uuid        NOT NULL REFERENCES doc_cadastros(id) ON DELETE CASCADE,
  grupo_id    uuid        NOT NULL REFERENCES grupos_acesso(id) ON DELETE CASCADE,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cadastro_id, grupo_id)
);

COMMENT ON TABLE doc_cadastro_grupos IS 'Quais grupos de acesso podem ver um cadastro de documentos restrito. Reusa grupos_acesso (migration 046). Cascade ao remover cadastro ou grupo.';

CREATE INDEX IF NOT EXISTS idx_doc_cadastro_grupos_grupo ON doc_cadastro_grupos (grupo_id);
CREATE INDEX IF NOT EXISTS idx_doc_cadastro_grupos_tenant ON doc_cadastro_grupos (tenant_id);

SELECT app_enable_tenant_rls('doc_cadastro_grupos');
