-- =====================================================================
-- 102 — Escola Cidadã (Cursos, Provas, Certificados)
-- =====================================================================
-- Plataforma de educação cidadã da prefeitura: cursos (módulos → aulas em
-- EditorJS), provas (objetivas + dissertativas com correção do professor),
-- fórum de dúvidas, inscrição/área do aluno e certificados PDF com QR +
-- validação pública, com editor visual de templates de certificado.
--
-- Todas as tabelas de dados nascem com tenant_id + RLS (skill multi-tenant-rls).
-- Portado do módulo Escola Legislativa (câmara, migration 106); mesmos nomes de
-- tabela/coluna (só o rótulo do produto muda). Certificate*, Curso*.
--
-- Referências a outros módulos (ex.: user_id → users, aula_id usado por outros
-- contextos) ficam escalares; mídia/PDF via storage_key. Ver REGRA 6.
-- =====================================================================

-- Papel do corpo docente (correção de dissertativas, gestão de cursos).
-- Fora de transação (ADD VALUE): psql -f roda em autocommit.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'professor';

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Cursos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cursos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo             text        NOT NULL,
  slug               citext,
  resumo             text,                                  -- chamada curta
  descricao          text,                                  -- HTML/rich (EditorJS)
  capa_url           text,
  capa_storage_key   text,
  carga_horaria      integer,                               -- em horas
  inicio_em          date,
  fim_em             date,
  certificacao       boolean     NOT NULL DEFAULT true,     -- emite certificado?
  nota_minima        numeric(5,2) NOT NULL DEFAULT 70,      -- % p/ aprovação
  template_id        uuid,                                  -- certificate_templates (escalar, sem FK)
  status             text        NOT NULL DEFAULT 'rascunho', -- rascunho | publicado | encerrado
  publicado          boolean     NOT NULL DEFAULT false,
  ordem              integer     NOT NULL DEFAULT 0,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cursos_status_check
    CHECK (status IN ('rascunho','publicado','encerrado'))
);
CREATE INDEX IF NOT EXISTS idx_cursos_tenant ON cursos (tenant_id, publicado, ordem);
CREATE INDEX IF NOT EXISTS idx_cursos_status ON cursos (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cursos_slug ON cursos (tenant_id, slug) WHERE slug IS NOT NULL;
SELECT app_enable_tenant_rls('cursos');

-- ── Módulos do curso ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_modulos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  titulo        text        NOT NULL,
  descricao     text,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curso_modulos ON curso_modulos (tenant_id, curso_id, ordem);
SELECT app_enable_tenant_rls('curso_modulos');

-- ── Aulas (conteúdo EditorJS, mídia, duração) ─────────────────────────────
CREATE TABLE IF NOT EXISTS curso_aulas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modulo_id     uuid        NOT NULL REFERENCES curso_modulos(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  titulo        text        NOT NULL,
  conteudo      jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- EditorJS blocks
  video_url     text,
  storage_key   text,
  duracao_min   integer,                                    -- duração estimada (min)
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curso_aulas ON curso_aulas (tenant_id, modulo_id, ordem);
CREATE INDEX IF NOT EXISTS idx_curso_aulas_curso ON curso_aulas (tenant_id, curso_id);
SELECT app_enable_tenant_rls('curso_aulas');

-- ── Conclusão de aula por aluno ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_aula_conclusoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aula_id       uuid        NOT NULL REFERENCES curso_aulas(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concluido_em  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aula_conclusao ON curso_aula_conclusoes (tenant_id, aula_id, user_id);
CREATE INDEX IF NOT EXISTS idx_aula_conclusao_user ON curso_aula_conclusoes (tenant_id, user_id, curso_id);
SELECT app_enable_tenant_rls('curso_aula_conclusoes');

-- ── Provas (por módulo ou final) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_provas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id        uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  modulo_id       uuid        REFERENCES curso_modulos(id) ON DELETE CASCADE, -- null = prova final
  titulo          text        NOT NULL,
  descricao       text,
  nota_minima     numeric(5,2) NOT NULL DEFAULT 70,         -- % aprovação
  tempo_limite_min integer,                                 -- minutos (null = sem limite)
  max_tentativas  integer     NOT NULL DEFAULT 1,
  embaralhar      boolean     NOT NULL DEFAULT false,
  ativa           boolean     NOT NULL DEFAULT true,
  ordem           integer     NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curso_provas ON curso_provas (tenant_id, curso_id, ordem);
CREATE INDEX IF NOT EXISTS idx_curso_provas_modulo ON curso_provas (tenant_id, modulo_id);
SELECT app_enable_tenant_rls('curso_provas');

-- ── Questões da prova ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_questoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prova_id      uuid        NOT NULL REFERENCES curso_provas(id) ON DELETE CASCADE,
  enunciado     text        NOT NULL,
  tipo          text        NOT NULL DEFAULT 'objetiva',    -- objetiva | dissertativa
  peso          numeric(5,2) NOT NULL DEFAULT 1,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curso_questoes_tipo_check
    CHECK (tipo IN ('objetiva','dissertativa'))
);
CREATE INDEX IF NOT EXISTS idx_curso_questoes ON curso_questoes (tenant_id, prova_id, ordem);
SELECT app_enable_tenant_rls('curso_questoes');

-- ── Opções (alternativas das objetivas) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_opcoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  questao_id    uuid        NOT NULL REFERENCES curso_questoes(id) ON DELETE CASCADE,
  texto         text        NOT NULL,
  correta       boolean     NOT NULL DEFAULT false,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curso_opcoes ON curso_opcoes (tenant_id, questao_id, ordem);
SELECT app_enable_tenant_rls('curso_opcoes');

-- ── Tentativas de prova ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_tentativas_prova (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prova_id      uuid        NOT NULL REFERENCES curso_provas(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numero        integer     NOT NULL DEFAULT 1,             -- nª tentativa do aluno
  status        text        NOT NULL DEFAULT 'em_andamento', -- em_andamento | aguardando_correcao | aprovado | reprovado
  nota          numeric(5,2),
  nota_objetiva numeric(5,2),
  iniciada_em   timestamptz NOT NULL DEFAULT now(),
  heartbeat_em  timestamptz,                                -- presença durante a prova
  finalizada_em timestamptz,
  corrigida_em  timestamptz,
  corrigida_por uuid        REFERENCES users(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tentativa_status_check
    CHECK (status IN ('em_andamento','aguardando_correcao','aprovado','reprovado'))
);
CREATE INDEX IF NOT EXISTS idx_tentativas_user ON curso_tentativas_prova (tenant_id, user_id, prova_id);
CREATE INDEX IF NOT EXISTS idx_tentativas_correcao ON curso_tentativas_prova (tenant_id, status, finalizada_em DESC);
SELECT app_enable_tenant_rls('curso_tentativas_prova');

-- ── Respostas por questão na tentativa ────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_tentativa_questoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tentativa_id  uuid        NOT NULL REFERENCES curso_tentativas_prova(id) ON DELETE CASCADE,
  questao_id    uuid        NOT NULL REFERENCES curso_questoes(id) ON DELETE CASCADE,
  opcao_id      uuid        REFERENCES curso_opcoes(id) ON DELETE SET NULL, -- objetiva
  resposta_texto text,                                      -- dissertativa
  correta       boolean,                                    -- objetiva: auto; dissertativa: prof.
  nota          numeric(5,2),                               -- dissertativa: dada pelo professor
  feedback      text,                                       -- comentário do professor
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tentativa_questao ON curso_tentativa_questoes (tenant_id, tentativa_id, questao_id);
CREATE INDEX IF NOT EXISTS idx_tentativa_questoes ON curso_tentativa_questoes (tenant_id, tentativa_id);
SELECT app_enable_tenant_rls('curso_tentativa_questoes');

-- ── Inscrições / área do aluno ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_inscricoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'ativa',       -- ativa | concluida | cancelada
  progresso     integer     NOT NULL DEFAULT 0,             -- % concluído (0..100)
  aprovado      boolean     NOT NULL DEFAULT false,
  inscrito_em   timestamptz NOT NULL DEFAULT now(),
  concluido_em  timestamptz,
  CONSTRAINT inscricao_status_check
    CHECK (status IN ('ativa','concluida','cancelada'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inscricao ON curso_inscricoes (tenant_id, curso_id, user_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_user ON curso_inscricoes (tenant_id, user_id, status);
SELECT app_enable_tenant_rls('curso_inscricoes');

-- ── Certificados (código único + PDF) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_certificados (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inscricao_id  uuid        REFERENCES curso_inscricoes(id) ON DELETE SET NULL,
  template_id   uuid,                                       -- certificate_templates (escalar)
  codigo        text        NOT NULL,                       -- código público de validação
  nome_aluno    text        NOT NULL,                       -- snapshot p/ validação pública
  titulo_curso  text        NOT NULL,                       -- snapshot
  carga_horaria integer,
  pdf_url       text,
  pdf_storage_key text,
  qr_url        text,
  emitido_em    timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificado_codigo ON curso_certificados (codigo);
CREATE INDEX IF NOT EXISTS idx_certificados_user ON curso_certificados (tenant_id, user_id, emitido_em DESC);
CREATE INDEX IF NOT EXISTS idx_certificados_curso ON curso_certificados (tenant_id, curso_id);
SELECT app_enable_tenant_rls('curso_certificados');

-- ── Tipos de certificado (catálogo de modelos por finalidade) ─────────────
CREATE TABLE IF NOT EXISTS certificate_types (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome          text        NOT NULL,
  descricao     text,
  ativo         boolean     NOT NULL DEFAULT true,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certificate_types ON certificate_types (tenant_id, ativo, ordem);
SELECT app_enable_tenant_rls('certificate_types');

-- ── Templates de certificado (editor visual) ──────────────────────────────
CREATE TABLE IF NOT EXISTS certificate_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type_id       uuid        REFERENCES certificate_types(id) ON DELETE SET NULL,
  nome          text        NOT NULL,
  fundo_url     text,                                       -- imagem de fundo
  fundo_storage_key text,
  largura       integer     NOT NULL DEFAULT 842,           -- pt (A4 paisagem)
  altura        integer     NOT NULL DEFAULT 595,
  orientacao    text        NOT NULL DEFAULT 'paisagem',    -- paisagem | retrato
  padrao        boolean     NOT NULL DEFAULT false,         -- template default do tenant
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificate_orient_check
    CHECK (orientacao IN ('paisagem','retrato'))
);
CREATE INDEX IF NOT EXISTS idx_certificate_templates ON certificate_templates (tenant_id, ativo);
SELECT app_enable_tenant_rls('certificate_templates');

-- ── Elementos posicionáveis do template (linhas, formas, QR) ──────────────
CREATE TABLE IF NOT EXISTS certificate_elements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id   uuid        NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  tipo          text        NOT NULL DEFAULT 'qr',          -- qr | linha | retangulo | assinatura
  pos_x         numeric(8,2) NOT NULL DEFAULT 0,
  pos_y         numeric(8,2) NOT NULL DEFAULT 0,
  largura       numeric(8,2),
  altura        numeric(8,2),
  config        jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- cor, espessura, etc.
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certificate_elements ON certificate_elements (tenant_id, template_id, ordem);
SELECT app_enable_tenant_rls('certificate_elements');

-- ── Textos posicionáveis do template (placeholders) ───────────────────────
CREATE TABLE IF NOT EXISTS certificate_texts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id   uuid        NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  conteudo      text        NOT NULL,                       -- pode conter {{nome}}, {{curso}}, {{codigo}}, {{data}}
  pos_x         numeric(8,2) NOT NULL DEFAULT 0,
  pos_y         numeric(8,2) NOT NULL DEFAULT 0,
  largura       numeric(8,2),
  fonte         text        NOT NULL DEFAULT 'Helvetica',
  tamanho       integer     NOT NULL DEFAULT 16,
  cor           text        NOT NULL DEFAULT '#000000',
  alinhamento   text        NOT NULL DEFAULT 'center',      -- left | center | right
  negrito       boolean     NOT NULL DEFAULT false,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificate_text_align_check
    CHECK (alinhamento IN ('left','center','right'))
);
CREATE INDEX IF NOT EXISTS idx_certificate_texts ON certificate_texts (tenant_id, template_id, ordem);
SELECT app_enable_tenant_rls('certificate_texts');

-- ── Fotos/imagens do template (logo, assinatura digitalizada) ─────────────
CREATE TABLE IF NOT EXISTS certificate_photos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id   uuid        NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  url           text,
  storage_key   text,
  pos_x         numeric(8,2) NOT NULL DEFAULT 0,
  pos_y         numeric(8,2) NOT NULL DEFAULT 0,
  largura       numeric(8,2),
  altura        numeric(8,2),
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certificate_photos ON certificate_photos (tenant_id, template_id, ordem);
SELECT app_enable_tenant_rls('certificate_photos');

-- ── Fórum: dúvidas por aula ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_aula_duvidas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aula_id       uuid        NOT NULL REFERENCES curso_aulas(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo        text,
  mensagem      text        NOT NULL,
  resolvida     boolean     NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aula_duvidas ON curso_aula_duvidas (tenant_id, aula_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_aula_duvidas_user ON curso_aula_duvidas (tenant_id, user_id);
SELECT app_enable_tenant_rls('curso_aula_duvidas');

-- ── Fórum: respostas (professor/alunos) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_aula_respostas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  duvida_id     uuid        NOT NULL REFERENCES curso_aula_duvidas(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mensagem      text        NOT NULL,
  do_professor  boolean     NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aula_respostas ON curso_aula_respostas (tenant_id, duvida_id, criado_em);
SELECT app_enable_tenant_rls('curso_aula_respostas');

-- ── Feedback do curso pelo aluno ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_feedbacks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nota          integer     NOT NULL DEFAULT 5,             -- 1..5
  comentario    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curso_feedback_nota_check CHECK (nota BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_curso_feedback ON curso_feedbacks (tenant_id, curso_id, user_id);
CREATE INDEX IF NOT EXISTS idx_curso_feedbacks ON curso_feedbacks (tenant_id, curso_id, criado_em DESC);
SELECT app_enable_tenant_rls('curso_feedbacks');

-- ── Restrições de inscrição no curso ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS curso_restricoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  curso_id      uuid        NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  tipo          text        NOT NULL DEFAULT 'vagas',       -- vagas | periodo | aprovacao | curso_pre
  valor         text,                                       -- ex.: nº de vagas, curso_id pré-requisito
  config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curso_restricoes ON curso_restricoes (tenant_id, curso_id);
SELECT app_enable_tenant_rls('curso_restricoes');

-- =====================================================================
-- GRANTs ao role da aplicação — módulo Escola Cidadã (RLS restringe por tenant).
-- Concede em TODAS as tabelas (idempotente; cobre as recém-criadas acima),
-- complementando o ALTER DEFAULT PRIVILEGES do setup.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro';
  END IF;
END$$;
