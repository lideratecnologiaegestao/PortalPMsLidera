-- =====================================================================
-- 025 — Chat interno (funcionários) + integração e-SIC
-- =====================================================================
-- Mensageria BACKSTAGE entre usuários INTERNOS (servidores/gestores/ouvidor…).
-- NÃO se confunde com a tramitação cidadão↔ouvidor (manifestacao_mensagens).
-- O cidadão nunca acessa o chat interno. Visibilidade restrita aos
-- PARTICIPANTES da conversa, além do isolamento por tenant (RLS).
-- =====================================================================

-- Conversas: DM (1:1), grupo/canal, ou vinculada a um protocolo (e-SIC/ouvidoria).
CREATE TABLE IF NOT EXISTS chat_conversas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo               text NOT NULL,                 -- dm | grupo | protocolo
  titulo             text,
  manifestacao_id    uuid REFERENCES manifestacoes(id) ON DELETE SET NULL, -- quando tipo=protocolo
  criado_por         uuid REFERENCES users(id) ON DELETE SET NULL,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conv_manif ON chat_conversas (manifestacao_id);
SELECT app_enable_tenant_rls('chat_conversas');

-- Participantes (define a visibilidade da conversa) + ponteiro de leitura.
CREATE TABLE IF NOT EXISTS chat_participantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id   uuid NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  papel         text,                               -- admin | membro
  ultimo_lido_em timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_part_user ON chat_participantes (tenant_id, user_id);
SELECT app_enable_tenant_rls('chat_participantes');

-- Mensagens. Anexos restritos em JSONB: [{ key, nome, mime, tamanho }].
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id   uuid NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
  autor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  conteudo      text,
  anexos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  respondendo_a uuid REFERENCES chat_mensagens(id) ON DELETE SET NULL,
  editado_em    timestamptz,
  excluido_em   timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_mensagens (conversa_id, criado_em);
SELECT app_enable_tenant_rls('chat_mensagens');

-- Foto de perfil (avatar) do usuário — mídia RESTRITA servida pelo backend.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_storage_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime        text;
