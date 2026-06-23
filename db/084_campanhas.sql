-- =====================================================================
-- 084 — Módulo Campanhas (Fase 1 / Fundação)
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Implementa o motor de campanhas institucionais da plataforma.
-- Permite que cada prefeitura (tenant) crie, agende e ative campanhas
-- com capacidades plugáveis: tema de cor, faixa informativa, banner,
-- popup, efeito interativo, selo e referência a página CMS.
--
-- Três tabelas:
--   1. campaign_template — biblioteca GLOBAL de presets (sem tenant_id).
--      Exemplos: Dengue/Aedes, Outubro Rosa, Copa do Mundo, Carnaval.
--   2. campaign          — instância de campanha POR TENANT.
--      Cada tenant instala um preset ou cria campanha customizada.
--   3. campaign_activation_log — auditoria de ativações/transições
--      por tenant (complementa audit_log da regra inviolável 6).
--
-- DIFERENÇA DE RLS
-- ----------------
-- campaign_template: dado de PLATAFORMA (padrão igual a ia_conteudos_global):
--   • SELECT: permitido a qualquer sessão (bots/frontends leem presets).
--   • INSERT/UPDATE/DELETE: restrito a app_is_platform() = true
--     (super_admin Lidera via console da plataforma).
--
-- campaign / campaign_activation_log: dados de TENANT (padrão multi-tenant):
--   • app_enable_tenant_rls → isolamento por tenant_id + bypass para
--     super_admin em modo plataforma (auditoria).
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
-- para que re-executar a migration não cause erro em nenhum ambiente.
-- Aplicar como superusuário postgres.
--
-- BASE LEGAL / LGPD
-- -----------------
-- Conteúdo de campanha (nome, cores, textos, imagens de referência)
-- NÃO contém dados pessoais (PII). Base legal de tratamento:
-- comunicação institucional / interesse público (LGPD art. 7º, III e IX).
-- Aviso de ano eleitoral (Lei 9.504/97): o sistema NÃO garante
-- conformidade eleitoral — responsabilidade do município/jurídico.
-- =====================================================================


-- =====================================================================
-- Tabela 1: campaign_template
-- Biblioteca GLOBAL de presets de campanha (sem tenant_id).
-- Padrão "dado de plataforma": leitura livre, escrita restrita ao
-- super_admin Lidera (app_is_platform()).
-- =====================================================================
CREATE TABLE IF NOT EXISTS campaign_template (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificador técnico único usado como chave de referência em
  -- campaign.template_key (ex.: 'dengue', 'outubro-rosa', 'copa').
  key                 text        NOT NULL,

  -- Nome legível para exibição na biblioteca do admin
  -- (ex.: 'Combate ao Aedes Aegypti / Dengue').
  nome                text        NOT NULL,

  -- Domínio temático controlado da campanha. Valores esperados:
  -- 'saude' | 'civico' | 'sazonal' | 'fiscal' | 'ambiental'
  -- | 'cultural' | 'administrativo'  (lista extensível sem ALTER TABLE).
  categoria           text        NOT NULL,

  -- Descrição opcional para o painel admin (até ~500 chars).
  descricao           text,

  -- Emoji ou nome de ícone curto para representação visual na biblioteca
  -- (ex.: '🦟', '🎗️', '⚽'). Nullable.
  icone               text,

  -- Capacidades habilitadas + params padrão (ver §2 do contrato).
  -- Estrutura: { tema?, faixa?, banner?, popup?, efeito?, pagina?, selo? }
  -- Cada chave presente habilita a capacidade; ausência = desabilitada.
  config_default      jsonb       NOT NULL DEFAULT '{}',

  -- Período/recorrência sugeridos para o tenant ao instalar o preset.
  -- Estrutura: { starts_at?, ends_at?, recorrencia? }
  -- O tenant pode sobrescrever ao instalar.
  sugestao            jsonb       NOT NULL DEFAULT '{}',

  -- Prioridade sugerida para resolução de conflitos entre campanhas.
  -- Maior número = maior precedência (padrão 100).
  prioridade_sugerida int         NOT NULL DEFAULT 100,

  ativo               boolean     NOT NULL DEFAULT true,

  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_campaign_template_key UNIQUE (key)
);

-- ---------------------------------------------------------------------
-- Comentários de documentação — campaign_template
-- ---------------------------------------------------------------------
COMMENT ON TABLE campaign_template IS
  'Biblioteca GLOBAL de presets de campanha da plataforma Lidera. '
  'Sem tenant_id — leitura livre por qualquer sessão; escrita restrita '
  'ao super_admin Lidera (app_is_platform()). Presets são instalados '
  'pelos tenants via POST /api/admin/campanhas/instalar. Sem PII; '
  'base legal: LGPD art. 7º III e IX (comunicação institucional).';

COMMENT ON COLUMN campaign_template.key IS
  'Identificador técnico único do preset (ex.: "dengue", "outubro-rosa"). '
  'Referenciado em campaign.template_key para rastrear a origem do preset.';

COMMENT ON COLUMN campaign_template.categoria IS
  'Domínio temático. Valores: saude, civico, sazonal, fiscal, ambiental, '
  'cultural, administrativo. Extensível sem ALTER TABLE.';

COMMENT ON COLUMN campaign_template.config_default IS
  'Capacidades habilitadas + params padrão do preset (§2 do contrato). '
  'Estrutura: { tema?, faixa?, banner?, popup?, efeito?, pagina?, selo? }. '
  'Copiado para campaign.config ao instalar; tenant pode sobrescrever.';

COMMENT ON COLUMN campaign_template.sugestao IS
  'Período e recorrência sugeridos ao instalar o preset. '
  'Estrutura: { starts_at?, ends_at?, recorrencia? }. '
  'Valores sugeridos; o tenant decide o período real.';

COMMENT ON COLUMN campaign_template.prioridade_sugerida IS
  'Prioridade sugerida para resolução de conflitos. '
  'Maior número = maior precedência. Copiado para campaign.prioridade ao instalar.';

COMMENT ON COLUMN campaign_template.icone IS
  'Emoji ou nome de ícone curto para representação visual na biblioteca '
  'do admin. Nullable — exibição opcional.';

-- ---------------------------------------------------------------------
-- Índices — campaign_template
-- ---------------------------------------------------------------------

-- Filtro principal da biblioteca: listar presets ativos por categoria.
CREATE INDEX IF NOT EXISTS idx_campaign_template_categoria_ativo
  ON campaign_template (categoria, ativo);

-- ---------------------------------------------------------------------
-- RLS — padrão "dado de plataforma" (sem tenant_id)
-- ---------------------------------------------------------------------
ALTER TABLE campaign_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_template FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leitura_global ON campaign_template;
CREATE POLICY leitura_global ON campaign_template
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS escrita_global ON campaign_template;
CREATE POLICY escrita_global ON campaign_template
  FOR ALL
  USING      (app_is_platform())
  WITH CHECK (app_is_platform());

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_campaign_template_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_campaign_template_atualizado_em ON campaign_template;
CREATE TRIGGER tg_campaign_template_atualizado_em
  BEFORE UPDATE ON campaign_template
  FOR EACH ROW EXECUTE FUNCTION trg_campaign_template_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs — campaign_template
-- ---------------------------------------------------------------------
-- portal_app (role da API NestJS): CRUD completo; RLS restringe
--   escritas a app_is_platform() em tempo de execução.
-- portal_ro  (leitura externa / DPO / relatórios): apenas SELECT.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_template TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON campaign_template TO portal_ro';
  END IF;
END;
$$;


-- =====================================================================
-- Tabela 2: campaign
-- Instância de campanha POR TENANT.
-- =====================================================================
CREATE TABLE IF NOT EXISTS campaign (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant obrigatório (regra inviolável do projeto).
  -- CASCADE remove todas as campanhas do tenant ao desativá-lo/excluí-lo.
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Chave do preset de origem; null = campanha customizada (sem preset).
  -- Não é FK para campaign_template (key pode ser renomeada/deletada
  -- na plataforma sem forçar cascade em campanhas históricas).
  template_key text,

  -- Nome legível da campanha no painel do admin do tenant.
  nome         text        NOT NULL,

  -- FSM de estados:
  -- draft → scheduled → active → paused → ended → archived
  -- O resolver da Fase 1 considera janela de datas; o scheduler BullMQ
  -- (Fase 2) formaliza as transições automáticas.
  status       text        NOT NULL DEFAULT 'draft',

  -- Janela de vigência. NULL em starts_at = sem limite inferior;
  -- NULL em ends_at = sem limite superior.
  starts_at    timestamptz,
  ends_at      timestamptz,

  -- Configuração de recorrência (gravado na Fase 1, consumido na Fase 2).
  -- Estrutura: { tipo: 'none' | 'annual' | 'seasonal' | 'rrule', ... }
  recorrencia  jsonb,

  -- (Fase 2) Quando true, o scheduler BullMQ gerencia transições
  -- automáticas de status. Na Fase 1 sempre false.
  autonomous   boolean     NOT NULL DEFAULT false,

  -- Prioridade para resolução de conflitos entre campanhas ativas.
  -- Maior número = maior precedência (padrão 100 = neutro).
  prioridade   int         NOT NULL DEFAULT 100,

  -- Capacidades habilitadas + overrides do tenant (ver §2 do contrato).
  -- Estrutura: { tema?, faixa?, banner?, popup?, efeito?, pagina?, selo? }
  -- Inicializado com campaign_template.config_default ao instalar preset.
  config       jsonb       NOT NULL DEFAULT '{}',

  -- Usuário (servidor público) que criou a campanha.
  -- SET NULL ao excluir o usuário: preserva o histórico da campanha.
  criado_por   uuid        REFERENCES users(id) ON DELETE SET NULL,

  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Comentários de documentação — campaign
-- ---------------------------------------------------------------------
COMMENT ON TABLE campaign IS
  'Instância de campanha institucional por tenant. '
  'Cada prefeitura instala presets da biblioteca global ou cria campanhas '
  'customizadas. O resolver GET /api/campanhas/ativas filtra por janela '
  'de datas e status e resolve conflitos por prioridade. '
  'Sem PII; base legal: LGPD art. 7º III e IX (comunicação institucional). '
  'RLS multi-tenant via app_enable_tenant_rls.';

COMMENT ON COLUMN campaign.tenant_id IS
  'Prefeitura (tenant) proprietária da campanha. '
  'FK → tenants(id) ON DELETE CASCADE.';

COMMENT ON COLUMN campaign.template_key IS
  'Chave do preset de origem em campaign_template.key. '
  'NULL = campanha customizada sem preset. Armazenado como texto (não FK) '
  'para preservar histórico mesmo que o preset global seja renomeado.';

COMMENT ON COLUMN campaign.status IS
  'Estado da campanha na FSM: draft | scheduled | active | paused | ended | archived. '
  'Fase 1: transições manuais via PATCH /status. '
  'Fase 2: scheduler BullMQ gerencia transições automáticas quando autonomous=true.';

COMMENT ON COLUMN campaign.starts_at IS
  'Início da vigência. NULL = sem limite inferior (campanha já em vigor desde a criação).';

COMMENT ON COLUMN campaign.ends_at IS
  'Fim da vigência. NULL = sem limite superior (campanha sem data de encerramento).';

COMMENT ON COLUMN campaign.recorrencia IS
  'Configuração de recorrência: { tipo: "none"|"annual"|"seasonal", ... }. '
  'Gravado na Fase 1; consumido pelo scheduler BullMQ na Fase 2.';

COMMENT ON COLUMN campaign.autonomous IS
  'Quando true (Fase 2), o scheduler BullMQ gerencia transições automáticas. '
  'Na Fase 1 sempre false — transições são manuais.';

COMMENT ON COLUMN campaign.prioridade IS
  'Prioridade para resolução de conflitos entre campanhas ativas. '
  'Maior número = maior precedência. Empate desempata por criado_em DESC.';

COMMENT ON COLUMN campaign.config IS
  'Capacidades habilitadas + overrides do tenant (§2 do contrato). '
  'Inicializado com campaign_template.config_default ao instalar preset. '
  'Cada chave presente habilita a capacidade; ausência = desabilitada.';

COMMENT ON COLUMN campaign.criado_por IS
  'UUID do servidor público que criou a campanha. '
  'FK → users(id) ON DELETE SET NULL: preserva a campanha ao excluir usuário.';

-- ---------------------------------------------------------------------
-- Índices — campaign
-- ---------------------------------------------------------------------

-- Filtro principal do resolver e do painel admin: campanhas por status.
CREATE INDEX IF NOT EXISTS idx_campaign_tenant_status
  ON campaign (tenant_id, status);

-- Resolver da Fase 1: filtra campanhas dentro da janela de vigência
-- (starts_at <= now() <= ends_at, tratando NULL como aberto).
CREATE INDEX IF NOT EXISTS idx_campaign_tenant_starts_ends
  ON campaign (tenant_id, starts_at, ends_at);

-- Índice de apoio ao RLS (permite ao planner eliminar páginas por
-- tenant_id antes de avaliar a policy — padrão do projeto).
CREATE INDEX IF NOT EXISTS idx_campaign_tenant_id
  ON campaign (tenant_id);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('campaign');

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_campaign_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_campaign_atualizado_em ON campaign;
CREATE TRIGGER tg_campaign_atualizado_em
  BEFORE UPDATE ON campaign
  FOR EACH ROW EXECUTE FUNCTION trg_campaign_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs — campaign
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON campaign TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON campaign TO portal_ro';
  END IF;
END;
$$;


-- =====================================================================
-- Tabela 3: campaign_activation_log
-- Auditoria de ativações/transições de campanha POR TENANT.
-- Complementa audit_log (regra inviolável 6) com granularidade de
-- ações específicas do módulo.
-- =====================================================================
CREATE TABLE IF NOT EXISTS campaign_activation_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant obrigatório.
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Campanha auditada. ON DELETE CASCADE: apagar a campanha remove seu log.
  campaign_id  uuid        NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,

  -- Ação registrada. Valores: created | installed | updated | activated
  --   | deactivated | scheduled | autostarted | ended
  acao         text        NOT NULL,

  -- Identificador do ator: 'scheduler' ou userId (uuid em texto).
  -- Armazenado como text para comportar o valor literal 'scheduler'
  -- sem FK (o scheduler não é um usuário da tabela users).
  ator         text        NOT NULL,

  -- Dados contextuais da ação (diff de campos, razão, IP etc.).
  -- NÃO armazenar PII — conteúdo de campanha não contém dados pessoais.
  detalhes     jsonb       NOT NULL DEFAULT '{}',

  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Comentários de documentação — campaign_activation_log
-- ---------------------------------------------------------------------
COMMENT ON TABLE campaign_activation_log IS
  'Auditoria de ativações e transições de campanhas por tenant. '
  'Complementa audit_log (regra inviolável 6) com granularidade '
  'de ações específicas do módulo (created, installed, activated…). '
  'Sem PII; base legal: LGPD art. 7º III e IX. '
  'RLS multi-tenant via app_enable_tenant_rls.';

COMMENT ON COLUMN campaign_activation_log.tenant_id IS
  'Prefeitura (tenant) proprietária do log. '
  'FK → tenants(id) ON DELETE CASCADE.';

COMMENT ON COLUMN campaign_activation_log.campaign_id IS
  'Campanha auditada. '
  'FK → campaign(id) ON DELETE CASCADE: apagar a campanha remove seu log.';

COMMENT ON COLUMN campaign_activation_log.acao IS
  'Ação registrada: created | installed | updated | activated | '
  'deactivated | scheduled | autostarted | ended.';

COMMENT ON COLUMN campaign_activation_log.ator IS
  'Identificador do ator: literal "scheduler" (BullMQ) ou '
  'UUID do usuário em texto (servidor público que executou a ação).';

COMMENT ON COLUMN campaign_activation_log.detalhes IS
  'Dados contextuais da ação (diff de campos, razão, IP etc.). '
  'NÃO armazenar PII — conteúdo de campanha não contém dados pessoais.';

-- ---------------------------------------------------------------------
-- Índices — campaign_activation_log
-- ---------------------------------------------------------------------

-- Consulta do histórico de uma campanha específica dentro do tenant.
CREATE INDEX IF NOT EXISTS idx_campaign_activation_log_tenant_campaign
  ON campaign_activation_log (tenant_id, campaign_id);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('campaign_activation_log');

-- ---------------------------------------------------------------------
-- GRANTs — campaign_activation_log
-- ---------------------------------------------------------------------
-- portal_app: INSERT (grava logs) + SELECT (painel de auditoria) +
--   DELETE (limpeza eventual de logs antigos — processo interno).
-- portal_ro: apenas SELECT (DPO / auditoria externa).
-- Nota: sem UPDATE — logs de auditoria são imutáveis (append-only).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON campaign_activation_log TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON campaign_activation_log TO portal_ro';
  END IF;
END;
$$;


-- =====================================================================
-- BLOCO DE VERIFICAÇÃO (comentado — executar manualmente no ambiente
-- de teste com o container PostGIS na porta 5433)
--
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_USER_A> pelos
-- UUIDs reais do ambiente de teste (ver rls-test-local-env.md).
-- Executar como role portal_app (NOSUPERUSER NOBYPASSRLS) para que
-- as policies RLS sejam avaliadas — o superusuário as ignora.
--
-- Conexão sugerida:
--   psql "postgresql://portal_app:<senha>@127.0.0.1:5433/portal"
-- Ou setar o role após conectar como superusuário:
--   SET ROLE portal_app;
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: inserir dados de bootstrap como super_admin (modo plataforma)
-- -----------------------------------------------------------------------
-- Conecte como superusuário (postgres) ou SET ROLE postgres primeiro,
-- depois ative o modo plataforma via set_config.
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- Seed: preset de template global (Dengue / Aedes)
INSERT INTO campaign_template
  (key, nome, categoria, descricao, icone, config_default, sugestao, prioridade_sugerida)
VALUES
  ('dengue', 'Combate ao Aedes Aegypti / Dengue', 'saude',
   'Campanha de conscientização para eliminação de focos do mosquito Aedes aegypti.',
   '🦟',
   '{"efeito": {"nome": "aedes-overlay", "params": {"quantidadeMosquitos": 5, "reabrirAposDias": 7}}, "faixa": {"mensagem": "Dengue: elimine os focos!", "corBg": "#b5006b", "corTexto": "#ffffff"}}',
   '{"recorrencia": {"tipo": "annual"}}',
   150),

  ('outubro-rosa', 'Outubro Rosa', 'saude',
   'Campanha de conscientização sobre o câncer de mama.',
   '🎗️',
   '{"tema": {"corPrimaria": "#e91e8c", "aplicarEm": "todo"}, "faixa": {"mensagem": "Outubro Rosa: cuide-se!", "corBg": "#e91e8c", "corTexto": "#ffffff"}}',
   '{"starts_at": "2026-10-01T00:00:00Z", "ends_at": "2026-10-31T23:59:59Z"}',
   120)
ON CONFLICT (key) DO NOTHING;

-- Campanhas por tenant (bootstrap — modo plataforma)
INSERT INTO campaign (tenant_id, template_key, nome, status, prioridade, config, criado_por)
VALUES
  ('<UUID_TENANT_A>', 'dengue', 'Dengue 2026 - Tenant A', 'active', 150,
   '{"efeito": {"nome": "aedes-overlay", "params": {"quantidadeMosquitos": 5}}, "faixa": {"mensagem": "Elimine os focos!", "corBg": "#b5006b", "corTexto": "#ffffff"}}',
   '<UUID_USER_A>'),
  ('<UUID_TENANT_B>', 'outubro-rosa', 'Outubro Rosa 2026 - Tenant B', 'active', 120,
   '{"tema": {"corPrimaria": "#e91e8c", "aplicarEm": "todo"}}',
   NULL)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------
-- TESTE 1: sessão de Tenant A enxerga apenas sua campanha (espera 1)
-- -----------------------------------------------------------------------
-- IMPORTANTE: conectar como portal_app (NOBYPASSRLS) para testar RLS.
-- SET ROLE portal_app;  -- ou conectar com a URL de portal_app
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_a
  FROM campaign;
-- Espera: 1 (apenas a campanha do Tenant A)

-- -----------------------------------------------------------------------
-- TESTE 2: Tenant A não enxerga campanha do Tenant B (espera 0)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_0_cross_tenant
  FROM campaign
 WHERE tenant_id = '<UUID_TENANT_B>';
-- Espera: 0 (RLS bloqueia cross-tenant)

-- -----------------------------------------------------------------------
-- TESTE 3: sessão de Tenant B enxerga apenas sua campanha (espera 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_b
  FROM campaign;
-- Espera: 1 (apenas a campanha do Tenant B)

-- -----------------------------------------------------------------------
-- TESTE 4: super_admin (app_is_platform) enxerga todas (espera 2)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_2_plataforma
  FROM campaign;
-- Espera: 2 (ambas as campanhas)

-- -----------------------------------------------------------------------
-- TESTE 5: sessão sem tenant definido não enxerga nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant
  FROM campaign;
-- Espera: 0 (sem tenant definido = nada visível)

-- -----------------------------------------------------------------------
-- TESTE 6: leitura global do template por sessão de tenant (espera 2)
-- campaign_template tem SELECT USING true → qualquer sessão lê
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_2_templates_tenant_le
  FROM campaign_template;
-- Espera: 2 (leitura global — USING true)

-- -----------------------------------------------------------------------
-- TESTE 7: escrita em campaign_template por sessão de tenant é BLOQUEADA
-- Deve falhar com "new row violates row-level security policy"
-- -----------------------------------------------------------------------
-- Descomente para testar:
-- INSERT INTO campaign_template (key, nome, categoria)
-- VALUES ('test-bloqueado', 'Deve Falhar', 'saude');
-- Espera: ERROR — violação de RLS (policy escrita_global requer app_is_platform())

-- -----------------------------------------------------------------------
-- TESTE 8: campaign_activation_log isolado por tenant
-- -----------------------------------------------------------------------
-- Inserir log como plataforma (bootstrap)
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

INSERT INTO campaign_activation_log (tenant_id, campaign_id, acao, ator, detalhes)
SELECT '<UUID_TENANT_A>', id, 'activated', '<UUID_USER_A>',
       '{"motivo": "teste de isolamento RLS"}'
  FROM campaign
 WHERE tenant_id = '<UUID_TENANT_A>'
 LIMIT 1;

INSERT INTO campaign_activation_log (tenant_id, campaign_id, acao, ator, detalhes)
SELECT '<UUID_TENANT_B>', id, 'installed', 'scheduler',
       '{"motivo": "teste cross-tenant"}'
  FROM campaign
 WHERE tenant_id = '<UUID_TENANT_B>'
 LIMIT 1;

-- Sessão de Tenant A vê apenas seu log (espera 1)
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_1_log_tenant_a
  FROM campaign_activation_log;

-- Sessão de Tenant A não vê log do Tenant B (espera 0)
SELECT count(*) AS deve_ser_0_log_cross_tenant
  FROM campaign_activation_log
 WHERE tenant_id = '<UUID_TENANT_B>';

-- -----------------------------------------------------------------------
-- TESTE 9: trigger atualizado_em em campaign_template
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE campaign_template
   SET descricao = descricao || ' (revisado)'
 WHERE key = 'dengue';

SELECT key, atualizado_em
  FROM campaign_template
 WHERE key = 'dengue';
-- Espera: atualizado_em com valor de now() recente

-- -----------------------------------------------------------------------
-- TESTE 10: trigger atualizado_em em campaign
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE campaign
   SET prioridade = 200
 WHERE tenant_id = '<UUID_TENANT_A>';

SELECT nome, prioridade, atualizado_em
  FROM campaign
 WHERE tenant_id = '<UUID_TENANT_A>';
-- Espera: prioridade = 200, atualizado_em = now() recente

-- -----------------------------------------------------------------------
-- TESTE 11: verificar índices no catálogo
-- -----------------------------------------------------------------------
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename IN ('campaign_template', 'campaign', 'campaign_activation_log')
 ORDER BY tablename, indexname;
-- Espera:
--   campaign: idx_campaign_tenant_id, idx_campaign_tenant_starts_ends,
--             idx_campaign_tenant_status
--   campaign_activation_log: idx_campaign_activation_log_tenant_campaign
--   campaign_template: idx_campaign_template_categoria_ativo

-- -----------------------------------------------------------------------
-- TESTE 12: verificar policies RLS no catálogo
-- -----------------------------------------------------------------------
SELECT tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE tablename IN ('campaign_template', 'campaign', 'campaign_activation_log')
 ORDER BY tablename, policyname;
-- Espera:
--   campaign_template: leitura_global (SELECT, USING true)
--                      escrita_global (ALL, USING app_is_platform())
--   campaign:          tenant_isolation (ALL, USING app_is_platform() OR tenant_id = app_current_tenant())
--   campaign_activation_log: tenant_isolation (idem)

-- -----------------------------------------------------------------------
-- Limpeza
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM campaign WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');
-- CASCADE remove campaign_activation_log automaticamente
DELETE FROM campaign_template WHERE key IN ('dengue', 'outubro-rosa');

*/
