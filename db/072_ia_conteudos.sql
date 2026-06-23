-- =====================================================================
-- 072 — Conteúdos livres de conhecimento da IA (ia_conteudos)
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Tabela que armazena artigos/textos longos usados como corpus do RAG
-- (Retrieval-Augmented Generation) do chatbot. Diferente de `ia_conhecimento`
-- (pares pergunta/resposta curtos e fixados), aqui ficam materiais
-- estruturados e de tamanho arbitrário: regimentos internos, normas
-- municipais, editais, programas de eventos, materiais educativos, guias
-- de serviço etc.
--
-- O worker de IA divide os registros ativos/vigentes em chunks, gera
-- embeddings e os indexa em `ia_chunks` (migration 054) para a camada de
-- busca semântica (pgvector). A busca full-text em português (tsvector
-- GENERATED) serve para o RAG léxico (camada 2) e para o painel de
-- administração.
--
-- Integração com `secretaria_id` permite que gestores de cada secretaria
-- (ex.: Secretaria de Educação) administrem apenas o acervo da sua área,
-- com o RLS de tenant garantindo que não haja vazamento entre entidades.
--
-- CONTROLE DE VIGÊNCIA
-- --------------------
-- `vigencia_inicio` e `vigencia_fim` (ambos nullable) permitem conteúdo
-- com validade definida (eventos, normas temporárias, chamamentos). O RAG
-- filtra por `ativo = true AND (vigencia_fim IS NULL OR vigencia_fim >= now())`
-- na camada de aplicação; o schema não impõe essa lógica para preservar
-- flexibilidade (ex.: consultar histórico de normas expiradas no admin).
--
-- VISIBILIDADE PÚBLICA
-- --------------------
-- `publico = false` sinaliza que o conteúdo NÃO deve ser exposto no chat
-- do cidadão (portal público). O chatbot usa apenas conteúdos com
-- `publico = true`; o atendente humano e o admin podem acessar todos.
-- O enforcement é na camada de aplicação (filtro WHERE no RAG); o RLS
-- garante apenas o isolamento entre tenants.
--
-- BASE LEGAL / LGPD
-- -----------------
-- Conteúdo institucional/público: regimentos, normas, eventos, material
-- educativo. NÃO armazena dados pessoais (PII). Base legal de tratamento:
-- interesse legítimo da Administração Pública (LGPD art. 7º, III) e
-- cumprimento de obrigação legal (art. 7º, II). Minimização: o campo
-- `conteudo` deve conter apenas texto institucional; qualquer PII
-- inadvertidamente presente é de responsabilidade do gestor que incluiu
-- o material e deve ser tratada pelo fluxo de anonimização (LGPD art. 18).
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS para
-- que re-executar a migration não cause erro em nenhum ambiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela: ia_conteudos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ia_conteudos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant — obrigatório; CASCADE apaga conteúdos
  -- junto com o tenant (ex.: off-boarding de prefeitura).
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,

  -- Escopo por lotação (nullable). NULL = conteúdo do portal principal,
  -- sem vínculo a secretaria específica. ON DELETE SET NULL preserva o
  -- conteúdo mesmo que a secretaria seja removida — igual ao padrão de
  -- noticias, documentos e galeria_itens (migration 034/071).
  secretaria_id   uuid        REFERENCES secretarias(id)          ON DELETE SET NULL,

  -- Classificação temática livre (ex.: 'Educação', 'Saúde', 'Eventos',
  -- 'Regimentos', 'Normas'). Nullable — não é campo controlado.
  categoria       text,

  titulo          text        NOT NULL,

  -- Corpo principal do artigo (markdown ou plain text). Tamanho arbitrário;
  -- o worker de chunking divide antes de gerar embeddings.
  conteudo        text        NOT NULL,

  -- Rótulos livres para filtro/busca no painel admin.
  tags            text[]      NOT NULL DEFAULT '{}',

  -- true  = pode ser usado no chat público do cidadão (padrão).
  -- false = visível apenas para atendentes/admin (ex.: norma interna).
  publico         boolean     NOT NULL DEFAULT true,

  ativo           boolean     NOT NULL DEFAULT true,

  -- Vigência opcional para conteúdo temporário. NULL = sem restrição de data.
  -- O RAG filtra vigencia_fim >= now() na camada de aplicação.
  vigencia_inicio date,
  vigencia_fim    date,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  -- Vetor de busca full-text em português, composto por título + conteúdo +
  -- categoria. GENERATED ALWAYS garante consistência sem trigger adicional.
  -- Indexado com GIN abaixo.
  busca           tsvector GENERATED ALWAYS AS (
                    to_tsvector(
                      'portuguese',
                      coalesce(titulo,    '') || ' ' ||
                      coalesce(conteudo,  '') || ' ' ||
                      coalesce(categoria, '')
                    )
                  ) STORED
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE ia_conteudos IS
  'Artigos/textos longos que alimentam o RAG do chatbot (corpus léxico e '
  'semântico). Materiais de estudo, regimentos, normas, eventos, guias etc. '
  'Sem PII; base legal: LGPD art. 7º II e III. Por tenant com RLS.';

COMMENT ON COLUMN ia_conteudos.secretaria_id IS
  'Secretaria responsável pelo conteúdo (nullable). '
  'NULL = acervo do portal principal / sem lotação. '
  'ON DELETE SET NULL — preserva o artigo se a secretaria for removida.';

COMMENT ON COLUMN ia_conteudos.categoria IS
  'Classificação temática livre (ex.: Educação, Saúde, Eventos, Regimentos, Normas). '
  'Nullable; composta no tsvector de busca.';

COMMENT ON COLUMN ia_conteudos.conteudo IS
  'Corpo do artigo em markdown ou plain text. '
  'Tamanho arbitrário; o worker de IA realiza chunking antes de gerar embeddings. '
  'NÃO armazenar dados pessoais (PII).';

COMMENT ON COLUMN ia_conteudos.publico IS
  'true = disponível no chat público do cidadão (padrão). '
  'false = visível apenas para atendentes/admin; nunca exposto no bot público.';

COMMENT ON COLUMN ia_conteudos.vigencia_inicio IS
  'Início da vigência do conteúdo (nullable). '
  'NULL = sem restrição de data de início. '
  'O RAG respeita vigência na camada de aplicação.';

COMMENT ON COLUMN ia_conteudos.vigencia_fim IS
  'Fim da vigência do conteúdo (nullable). '
  'NULL = sem expiração. '
  'O RAG filtra vigencia_fim IS NULL OR vigencia_fim >= now() na camada de aplicação.';

COMMENT ON COLUMN ia_conteudos.busca IS
  'tsvector em português GENERATED ALWAYS: título + conteúdo + categoria. '
  'Indexado com GIN; usado pelo RAG léxico (camada 2) e pela busca do painel admin.';

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- Busca full-text principal (GIN em tsvector gerado).
CREATE INDEX IF NOT EXISTS idx_ia_conteudos_busca
  ON ia_conteudos USING gin (busca);

-- Filtro mais frequente em produção: listar artigos de uma secretaria
-- dentro do tenant ativo.
CREATE INDEX IF NOT EXISTS idx_ia_conteudos_tenant_secretaria
  ON ia_conteudos (tenant_id, secretaria_id);

-- Filtro do worker de IA e das listagens do painel admin:
-- conteúdos ativos de um tenant (com possível filtro de vigência no app).
CREATE INDEX IF NOT EXISTS idx_ia_conteudos_tenant_ativo
  ON ia_conteudos (tenant_id, ativo);

-- ---------------------------------------------------------------------
-- RLS — isolamento por tenant
-- ---------------------------------------------------------------------
-- app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON … USING / WITH CHECK
--     (app_is_platform() OR tenant_id = app_current_tenant());
--
-- Garante:
--   • super_admin em modo plataforma (app_is_platform() = true) enxerga
--     todos os conteúdos de todos os tenants.
--   • Sessões de tenant enxergam apenas conteúdos do próprio tenant.
--   • Sessões sem tenant_id definido (app_current_tenant() = NULL) não
--     enxergam nada.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('ia_conteudos');

-- ---------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- ---------------------------------------------------------------------
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
-- Segue o padrão de elevation_requests (migration 069).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ia_conteudos_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ia_conteudos_atualizado_em ON ia_conteudos;
CREATE TRIGGER tg_ia_conteudos_atualizado_em
  BEFORE UPDATE ON ia_conteudos
  FOR EACH ROW EXECUTE FUNCTION trg_ia_conteudos_atualizado_em();

-- ---------------------------------------------------------------------
-- GRANTs para portal_app e portal_ro
-- ---------------------------------------------------------------------
-- portal_app (role da API NestJS): acesso completo CRUD.
-- portal_ro  (relatórios / DPO / leitura externa): apenas SELECT.
--
-- Idempotente: verifica existência do role antes de gravar para não
-- falhar em ambientes de setup fresh sem seed de roles.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ia_conteudos TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON ia_conteudos TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO
-- Executar em sessão de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_SECRETARIA_A>
-- pelos UUIDs reais do ambiente de teste (porta 5433 / container PostGIS).
-- NÃO executar em produção com dados reais.
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: ativa modo plataforma para inserções de bootstrap
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- Conteúdo público (regimento) do Tenant A
INSERT INTO ia_conteudos
  (tenant_id, secretaria_id, categoria, titulo, conteudo, tags, publico, ativo)
VALUES
  ('<UUID_TENANT_A>', '<UUID_SECRETARIA_A>', 'Regimentos',
   'Regimento Interno da Câmara Municipal',
   'Art. 1º A Câmara Municipal reger-se-á por este Regimento Interno...',
   ARRAY['câmara','regimento','legislativo'], true, true),

  ('<UUID_TENANT_A>', NULL, 'Eventos',
   'Programação Festa Junina 2026',
   'Datas: 12, 13 e 14 de junho. Local: Praça Central...',
   ARRAY['evento','festa junina','cultura'], true, true,
   '2026-06-12'::date, '2026-06-14'::date);

-- Conteúdo interno (não público) do Tenant A
INSERT INTO ia_conteudos
  (tenant_id, categoria, titulo, conteudo, tags, publico, ativo)
VALUES
  ('<UUID_TENANT_A>', 'Normas', 'Norma Interna 001/2026 — Uso de TI',
   'Esta norma regula o uso dos recursos de tecnologia da informação...',
   ARRAY['norma','ti','interno'], false, true);

-- Conteúdo do Tenant B (para teste de isolamento)
INSERT INTO ia_conteudos
  (tenant_id, categoria, titulo, conteudo, tags)
VALUES
  ('<UUID_TENANT_B>', 'Saúde', 'Calendário Vacinal 2026',
   'Vacina Influenza: abril. Vacina COVID: conforme disponibilidade...',
   ARRAY['saúde','vacina','calendário']);

-- -----------------------------------------------------------------------
-- TESTE 1: sessão do Tenant A enxerga apenas seus conteúdos (espera 3)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_3_tenant_a FROM ia_conteudos;

-- -----------------------------------------------------------------------
-- TESTE 2: filtro por publico = true retorna apenas 2 (escopo de aplicação)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_2_publicos
  FROM ia_conteudos
 WHERE publico = true;

-- -----------------------------------------------------------------------
-- TESTE 3: filtro por secretaria retorna apenas 1
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_1_secretaria
  FROM ia_conteudos
 WHERE secretaria_id = '<UUID_SECRETARIA_A>';

-- -----------------------------------------------------------------------
-- TESTE 4: conteúdo expirado NÃO aparece no RAG (filtro de aplicação)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_1_vigente
  FROM ia_conteudos
 WHERE ativo = true
   AND publico = true
   AND (vigencia_fim IS NULL OR vigencia_fim >= now());
-- Espera: 1 (regimento, sem data de fim) — o evento de festa junina expirou

-- -----------------------------------------------------------------------
-- TESTE 5: sessão do Tenant B NÃO enxerga conteúdos do Tenant A (espera 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_b FROM ia_conteudos;

-- -----------------------------------------------------------------------
-- TESTE 6: super_admin em modo plataforma vê todos (espera 4)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_4_plataforma FROM ia_conteudos;

-- -----------------------------------------------------------------------
-- TESTE 7: sessão sem tenant definido não enxerga nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM ia_conteudos;

-- -----------------------------------------------------------------------
-- TESTE 8: busca full-text em português funciona
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT titulo
  FROM ia_conteudos
 WHERE busca @@ to_tsquery('portuguese', 'regimento');
-- Espera: 'Regimento Interno da Câmara Municipal'

-- -----------------------------------------------------------------------
-- TESTE 9: trigger de atualizado_em funciona
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE ia_conteudos
   SET titulo = titulo || ' (revisado)'
 WHERE tenant_id = '<UUID_TENANT_A>'
   AND categoria = 'Regimentos';

SELECT titulo, atualizado_em
  FROM ia_conteudos
 WHERE tenant_id = '<UUID_TENANT_A>'
   AND categoria = 'Regimentos';
-- Espera: atualizado_em recente (valor de now() no momento do UPDATE)

-- -----------------------------------------------------------------------
-- TESTE 10: verificar índices no catálogo
-- -----------------------------------------------------------------------
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'ia_conteudos'
 ORDER BY indexname;
-- Espera: idx_ia_conteudos_busca (gin), idx_ia_conteudos_tenant_secretaria,
--         idx_ia_conteudos_tenant_ativo

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM ia_conteudos
 WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');

*/
