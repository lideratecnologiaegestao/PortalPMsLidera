-- =====================================================================
-- 048 — LGPD: self-service do titular + registro de incidentes
-- =====================================================================
-- Bloco 10 (LGPD) da aderência TR. Spec: specs/lgpd-self-service-incidentes.md
--
--   tenants.dpo_nome / dpo_email  — contato estruturado do Encarregado (art. 41)
--   solicitacoes_titular          — requisições de direitos do titular (art. 18)
--   incidentes_seguranca          — registro/comunicação de incidentes (art. 48)
--
-- RLS = isolamento por TENANT (padrão app_enable_tenant_rls). O escopo por
-- usuário (o cidadão só vê as PRÓPRIAS solicitações) é aplicado na camada de
-- serviço — o PrismaService só seta app.current_tenant_id, não o user.
-- Usa text + CHECK (não enums PG) para facilitar o Prisma, como a migration 047.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contato do Encarregado (DPO) — estruturado em tenants
-- ---------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS dpo_nome  text,
  ADD COLUMN IF NOT EXISTS dpo_email text;

COMMENT ON COLUMN tenants.dpo_nome  IS 'Nome do Encarregado pelo tratamento de dados (LGPD art. 41). Publicado de forma clara e objetiva.';
COMMENT ON COLUMN tenants.dpo_email IS 'E-mail de contato do Encarregado (DPO). Exibido na política de privacidade e no canal de direitos do titular.';

-- ---------------------------------------------------------------------
-- 2. solicitacoes_titular — direitos do titular (art. 18)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitacoes_titular (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT: não apaga o titular enquanto houver solicitação
  titular_id           uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tipo                 text        NOT NULL,
  descricao            text,
  status               text        NOT NULL DEFAULT 'aberta',
  prazo_em             timestamptz NOT NULL,                 -- criado_em + 15 dias (art. 19)
  atrasada             boolean     NOT NULL DEFAULT false,
  resposta             text,
  indeferimento_motivo text,
  anexo_storage_key    text,
  tratado_por          uuid        REFERENCES users(id) ON DELETE SET NULL,
  tratado_em           timestamptz,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitacoes_titular_tipo_chk CHECK (tipo IN (
    'confirmacao_existencia','acesso','correcao','anonimizacao','bloqueio',
    'eliminacao','portabilidade','info_compartilhamento','revogacao_consentimento',
    'oposicao','revisao_decisao_automatizada'
  )),
  CONSTRAINT solicitacoes_titular_status_chk CHECK (status IN (
    'aberta','em_andamento','encaminhada','concluida','indeferida'
  ))
);

COMMENT ON TABLE  solicitacoes_titular IS 'Requisições de direitos do titular (LGPD art. 18). Cidadão cria e acompanha as suas; Encarregado/gestor trata. Escopo por usuário aplicado no serviço.';
COMMENT ON COLUMN solicitacoes_titular.tipo     IS 'Direito exercido (art. 18 I-IX / art. 20). Ver CHECK.';
COMMENT ON COLUMN solicitacoes_titular.prazo_em IS 'Prazo legal de resposta = criado_em + 15 dias (LGPD art. 19).';
COMMENT ON COLUMN solicitacoes_titular.atrasada IS 'true quando o prazo venceu sem conclusão (derivado/atualizado por varredura).';

CREATE INDEX IF NOT EXISTS idx_sol_titular_tenant_status ON solicitacoes_titular (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sol_titular_titular       ON solicitacoes_titular (titular_id);
CREATE INDEX IF NOT EXISTS idx_sol_titular_prazo         ON solicitacoes_titular (prazo_em) WHERE status IN ('aberta','em_andamento');

SELECT app_enable_tenant_rls('solicitacoes_titular');

-- ---------------------------------------------------------------------
-- 3. incidentes_seguranca — registro/comunicação de incidentes (art. 48)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidentes_seguranca (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo                    text        NOT NULL,
  descricao                 text        NOT NULL,
  categoria                 text        NOT NULL,
  natureza                  text,
  dados_afetados            text[]      NOT NULL DEFAULT '{}',
  titulares_afetados_estimados int,
  severidade                text        NOT NULL,
  risco_descricao           text,
  risco_nivel               text,
  ocorrido_em               timestamptz,
  detectado_em              timestamptz NOT NULL DEFAULT now(),
  prazo_comunicacao_em      timestamptz NOT NULL,            -- detectado_em + 2d (alta/crítica) ou 5d
  comunicacao_atrasada      boolean     NOT NULL DEFAULT false,
  status                    text        NOT NULL DEFAULT 'registrado',
  medidas_contencao         text,
  medidas_mitigacao         text,
  comunicado_anpd           boolean     NOT NULL DEFAULT false,
  comunicado_anpd_em        timestamptz,
  comunicado_anpd_protocolo text,
  comunicado_titulares      boolean     NOT NULL DEFAULT false,
  comunicado_titulares_em   timestamptz,
  comunicado_titulares_meio text,
  responsavel_id            uuid        REFERENCES users(id) ON DELETE SET NULL,
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  atualizado_em             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidentes_categoria_chk CHECK (categoria IN (
    'acesso_indevido','vazamento','perda','ransomware','indisponibilidade','erro_humano','outro'
  )),
  CONSTRAINT incidentes_severidade_chk CHECK (severidade IN ('baixa','media','alta','critica')),
  CONSTRAINT incidentes_status_chk CHECK (status IN (
    'registrado','em_avaliacao','em_contencao','comunicado','encerrado'
  ))
);

COMMENT ON TABLE  incidentes_seguranca IS 'Registro e comunicação de incidentes de segurança com dados pessoais (LGPD art. 48). Acesso restrito a staff (admin/ouvidor/gestor) — escopo por papel no serviço.';
COMMENT ON COLUMN incidentes_seguranca.prazo_comunicacao_em IS 'Prazo de comunicação = detectado_em + 2 dias (alta/crítica ou dado sensível) ou + 5 dias (demais).';

CREATE INDEX IF NOT EXISTS idx_incidentes_tenant_status ON incidentes_seguranca (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_incidentes_prazo         ON incidentes_seguranca (prazo_comunicacao_em) WHERE status NOT IN ('comunicado','encerrado');
CREATE INDEX IF NOT EXISTS idx_incidentes_detectado     ON incidentes_seguranca (tenant_id, detectado_em DESC);

SELECT app_enable_tenant_rls('incidentes_seguranca');
