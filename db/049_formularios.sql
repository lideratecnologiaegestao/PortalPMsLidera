-- =====================================================================
-- 049 — Construtor de formulários (bloco 8 do TR)
-- =====================================================================
-- Spec: specs/construtor-formularios.md
--
--   formularios       — definição do formulário (schema de campos em JSONB)
--   formulario_envios — respostas captadas (dados + anexos), dado pessoal
--
-- RLS por tenant (app_enable_tenant_rls). text + CHECK (sem enum PG).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. formularios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formularios (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug                 text        NOT NULL,
  titulo               text        NOT NULL,
  descricao            text,
  -- lista ORDENADA de campos do formulário (builder drag-drop)
  schema               jsonb       NOT NULL DEFAULT '[]',
  status               text        NOT NULL DEFAULT 'rascunho',
  mensagem_confirmacao text,
  redirecionar_url     text,
  login_obrigatorio    boolean     NOT NULL DEFAULT false,
  multiplos_envios     boolean     NOT NULL DEFAULT true,
  captcha_habilitado   boolean     NOT NULL DEFAULT true,
  notificar_emails     text[]      NOT NULL DEFAULT '{}',
  notificar_cc         text[]      NOT NULL DEFAULT '{}',
  notificar_bcc        text[]      NOT NULL DEFAULT '{}',
  total_envios         int         NOT NULL DEFAULT 0,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CONSTRAINT formularios_status_chk CHECK (status IN ('rascunho','publicado','encerrado'))
);

COMMENT ON TABLE  formularios        IS 'Formulários eletrônicos criados pelo gestor (builder drag-drop). schema = lista de campos em JSONB.';
COMMENT ON COLUMN formularios.schema IS 'Array ordenado de campos: {id,tipo,label,nome,obrigatorio,largura,opcoes?,validacao?,...}. Ver specs/construtor-formularios.md.';
COMMENT ON COLUMN formularios.status IS 'rascunho (oculto) | publicado (rota pública ativa) | encerrado (não aceita envios).';

CREATE INDEX IF NOT EXISTS idx_formularios_tenant ON formularios (tenant_id, status);

SELECT app_enable_tenant_rls('formularios');

-- ---------------------------------------------------------------------
-- 2. formulario_envios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formulario_envios (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  formulario_id uuid        NOT NULL REFERENCES formularios(id) ON DELETE CASCADE,
  dados         jsonb       NOT NULL DEFAULT '{}',
  anexos        jsonb       NOT NULL DEFAULT '[]',
  cidadao_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  ip            inet,
  user_agent    text,
  lido          boolean     NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  formulario_envios        IS 'Respostas captadas de um formulário. Dado pessoal (LGPD): RLS por tenant, export e anexos restritos a staff.';
COMMENT ON COLUMN formulario_envios.dados  IS 'Respostas por chave de campo: { nomeCampo: valor }.';
COMMENT ON COLUMN formulario_envios.anexos IS 'Arquivos enviados: [{campo,nome,mime,storageKey,tamanho}]. Servidos só via endpoint autenticado.';

CREATE INDEX IF NOT EXISTS idx_form_envios_form  ON formulario_envios (tenant_id, formulario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_form_envios_fid   ON formulario_envios (formulario_id);

SELECT app_enable_tenant_rls('formulario_envios');
