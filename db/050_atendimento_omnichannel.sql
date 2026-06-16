-- =====================================================================
-- 050 — Atendimento omnichannel (chatbot + atendimento humano) — bloco 13 TR
-- =====================================================================
-- ADR + spec: specs/atendimento-omnichannel.md
--
--   tenants.*                 — flags/config do atendimento por município
--   atendimento_horario       — expediente (por dia da semana)
--   atendimento_tags          — etiquetas de conversa por tenant
--   atendimento_conversas     — sessão de atendimento (widget/whatsapp; bot→humano)
--   atendimento_mensagens     — mensagens (visitante/bot/agente/sistema; nota interna)
--   atendimento_eventos       — auditoria de ações da conversa
--
-- RLS = isolamento por tenant (app_enable_tenant_rls). Escopo por usuário/
-- visitante/secretaria é aplicado na camada de serviço. text+CHECK (sem enum PG).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Campos de configuração em tenants
-- ---------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS atendimento_humano_ativo     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_chat_widget_ativo         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atendimento_aviso_lgpd        text,
  ADD COLUMN IF NOT EXISTS atendimento_mensagem_fora_exp text,
  ADD COLUMN IF NOT EXISTS atendimento_saudacao          text,
  ADD COLUMN IF NOT EXISTS atendimento_inatividade_min   integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS atendimento_timezone          text NOT NULL DEFAULT 'America/Cuiaba',
  ADD COLUMN IF NOT EXISTS evolution_instancia           text;

COMMENT ON COLUMN tenants.atendimento_humano_ativo IS 'Liga o widget de atendimento (bot + agente humano) no portal público.';
COMMENT ON COLUMN tenants.ia_chat_widget_ativo      IS 'Permite o bot IA responder no widget (depende de ia_chat_habilitada). Se off, o widget vai direto à fila de agente.';
COMMENT ON COLUMN tenants.evolution_instancia       IS 'Nome da instância Evolution (WhatsApp) deste tenant — resolve o webhook para o tenant.';

-- ---------------------------------------------------------------------
-- 2. Horário de atendimento (expediente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_horario (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dia_semana   integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo
  hora_inicio  time    NOT NULL,
  hora_fim     time    NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, dia_semana)
);
COMMENT ON TABLE atendimento_horario IS 'Expediente de atendimento humano por dia da semana (timezone do tenant).';
SELECT app_enable_tenant_rls('atendimento_horario');

-- ---------------------------------------------------------------------
-- 3. Tags
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  cor        text NOT NULL DEFAULT '#6B7280',
  UNIQUE (tenant_id, nome)
);
COMMENT ON TABLE atendimento_tags IS 'Etiquetas de classificação de conversas, por tenant.';
SELECT app_enable_tenant_rls('atendimento_tags');

-- ---------------------------------------------------------------------
-- 4. Conversas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_conversas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canal                    text NOT NULL CHECK (canal IN ('widget','whatsapp')),
  status                   text NOT NULL DEFAULT 'bot'
                             CHECK (status IN ('bot','aguardando_agente','em_atendimento','encerrada')),
  visitante_nome           text,
  visitante_email          text,
  visitante_telefone       text,
  visitante_identificador  text,   -- número WhatsApp ou sessionId anônimo do widget
  cidadao_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  secretaria_id            uuid REFERENCES secretarias(id) ON DELETE SET NULL,
  agente_id                uuid REFERENCES users(id) ON DELETE SET NULL,
  assunto                  text,
  origem_url               text,
  tag_ids                  uuid[] NOT NULL DEFAULT '{}',
  iniciada_em              timestamptz NOT NULL DEFAULT now(),
  encerrada_em             timestamptz,
  ultima_atividade_em      timestamptz NOT NULL DEFAULT now(),
  bot_tentativas           integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE atendimento_conversas IS 'Sessão de atendimento (widget/WhatsApp). Ciclo bot→aguardando_agente→em_atendimento→encerrada. Dado pessoal (LGPD): RLS por tenant.';
CREATE INDEX IF NOT EXISTS idx_atend_conv_tenant_status     ON atendimento_conversas (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_atend_conv_tenant_secretaria ON atendimento_conversas (tenant_id, secretaria_id);
CREATE INDEX IF NOT EXISTS idx_atend_conv_ult_atividade     ON atendimento_conversas (tenant_id, ultima_atividade_em) WHERE status <> 'encerrada';
CREATE INDEX IF NOT EXISTS idx_atend_conv_tag_ids           ON atendimento_conversas USING GIN (tag_ids);
CREATE INDEX IF NOT EXISTS idx_atend_conv_visitante_id      ON atendimento_conversas (tenant_id, visitante_identificador);
SELECT app_enable_tenant_rls('atendimento_conversas');

-- ---------------------------------------------------------------------
-- 5. Mensagens
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_mensagens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id  uuid NOT NULL REFERENCES atendimento_conversas(id) ON DELETE CASCADE,
  autor_tipo   text NOT NULL CHECK (autor_tipo IN ('visitante','bot','agente','sistema')),
  autor_id     uuid REFERENCES users(id) ON DELETE SET NULL, -- quando autor_tipo='agente'
  conteudo     text NOT NULL,
  anexos       jsonb NOT NULL DEFAULT '[]',
  interno      boolean NOT NULL DEFAULT false,  -- nota interna; nunca retornada ao visitante
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE atendimento_mensagens IS 'Mensagens da conversa. interno=true = nota interna (só agentes).';
CREATE INDEX IF NOT EXISTS idx_atend_msg_conversa       ON atendimento_mensagens (conversa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_atend_msg_tenant_recente ON atendimento_mensagens (tenant_id, criado_em DESC);
SELECT app_enable_tenant_rls('atendimento_mensagens');

-- ---------------------------------------------------------------------
-- 6. Eventos de auditoria
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id  uuid NOT NULL REFERENCES atendimento_conversas(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN (
                 'iniciada','bot_respondeu','escalada','assumida','atribuida',
                 'transferida','encerrada','reaberta','mensagem_whatsapp_recebida'
               )),
  ator_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE atendimento_eventos IS 'Trilha de auditoria por conversa (escalada/transferência/encerramento). Sem conteúdo de mensagem.';
CREATE INDEX IF NOT EXISTS idx_atend_ev_conversa ON atendimento_eventos (conversa_id, criado_em);
SELECT app_enable_tenant_rls('atendimento_eventos');
