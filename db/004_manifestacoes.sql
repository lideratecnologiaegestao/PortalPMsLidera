-- =====================================================================
-- 004 — Manifestações: ESIC (LAI 12.527/2011) + Ouvidoria (Lei 13.460/2017)
-- =====================================================================
-- Modelo unificado com discriminador `canal`. Cada canal tem prazos legais
-- distintos (ver api/src/modules/manifestacoes/sla.ts). A máquina de estados
-- vive na aplicação; aqui guardamos estado atual, prazos e histórico imutável.
-- =====================================================================

CREATE TYPE manifestacao_canal AS ENUM ('esic', 'ouvidoria');

-- Subtipos da Ouvidoria conforme Lei 13.460/2017
CREATE TYPE manifestacao_tipo AS ENUM (
  'acesso_informacao',  -- ESIC
  'denuncia',
  'reclamacao',
  'sugestao',
  'elogio',
  'solicitacao'
);

CREATE TYPE manifestacao_status AS ENUM (
  'registrada',
  'em_analise',           -- triagem
  'em_tratamento',        -- com a área responsável
  'aguardando_cidadao',   -- pendente de complemento do solicitante (pausa SLA)
  'prorrogada',           -- prazo estendido com justificativa
  'respondida',
  'indeferida',           -- ESIC: negada
  'parcialmente_atendida',
  'recurso_1a_instancia', -- ESIC
  'recurso_2a_instancia', -- ESIC
  'concluida',
  'arquivada'
);

CREATE TABLE manifestacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  protocolo       text NOT NULL,                 -- gerado no app: AAAA + sequencial
  canal           manifestacao_canal NOT NULL,
  tipo            manifestacao_tipo NOT NULL,
  status          manifestacao_status NOT NULL DEFAULT 'registrada',
  anonima         boolean NOT NULL DEFAULT false,
  -- solicitante (NULL/parcial quando anônima — permitido p/ denúncia)
  cidadao_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  solicitante_nome text,
  solicitante_email citext,
  assunto         text NOT NULL,
  descricao       text NOT NULL,
  secretaria_id   uuid REFERENCES secretarias(id) ON DELETE SET NULL,
  responsavel_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  -- SLA: prazo calculado no registro; pode ser prorrogado
  prazo_em        timestamptz NOT NULL,
  prorrogado      boolean NOT NULL DEFAULT false,
  prorrogacao_justificativa text,
  sla_pausado_em  timestamptz,                   -- preenchido quando aguardando_cidadao
  resposta        text,
  respondido_em   timestamptz,
  classificacao_sigilo text,                     -- LAI: reservada/secreta/ultrassecreta
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, protocolo)
);
CREATE INDEX idx_manif_tenant_status ON manifestacoes (tenant_id, status);
CREATE INDEX idx_manif_prazo ON manifestacoes (prazo_em) WHERE status NOT IN
  ('respondida','concluida','arquivada','indeferida','parcialmente_atendida');
SELECT app_enable_tenant_rls('manifestacoes');

-- Histórico imutável de transições (auditoria do fluxo + comprovação de SLA).
CREATE TABLE manifestacao_eventos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
  de_status       manifestacao_status,
  para_status     manifestacao_status NOT NULL,
  evento          text NOT NULL,                 -- nome da transição da FSM
  ator_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  observacao      text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_manif_eventos ON manifestacao_eventos (manifestacao_id, criado_em);
SELECT app_enable_tenant_rls('manifestacao_eventos');

-- Anexos (documentos do pedido ou da resposta).
CREATE TABLE manifestacao_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
  origem          text NOT NULL DEFAULT 'cidadao', -- cidadao | orgao
  nome_arquivo    text NOT NULL,
  storage_key     text NOT NULL,
  mime            text,
  tamanho_bytes   bigint,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('manifestacao_anexos');
