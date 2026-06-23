-- =====================================================================
-- 074 — Comentários de cidadãos em notícias (noticia_comentarios)
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Permite que cidadãos autenticados comentem nas notícias do portal.
-- Toda postagem entra com status 'pendente' e só fica visível ao público
-- após aprovação explícita pelo moderador (status = 'aprovado').
-- O painel admin exibe a fila de pendentes para moderação.
--
-- LGPD / DADOS PESSOAIS
-- ---------------------
-- Esta tabela armazena dados pessoais do cidadão-comentarista:
--
--   • conteudo   — texto livre (pode conter PII inadvertida)
--   • autor_nome — snapshot do nome de exibição no momento do comentário
--   • ip         — endereço IP de origem (dado pessoal conforme LGPD art. 5º, I)
--
-- Base legal:
--   conteudo / autor_nome → consentimento (LGPD art. 7º, I): o cidadão
--     concorda explicitamente ao submeter o formulário de comentário.
--   ip → interesse legítimo da Administração (LGPD art. 7º, IX): retido
--     exclusivamente para prevenção de abuso/spam e auditoria de segurança.
--
-- Minimização / retenção:
--   • ip NÃO deve ser exibido publicamente em nenhuma circunstância.
--   • A aplicação deve oferecer ao cidadão mecanismo de exclusão do
--     comentário (exercício do direito de eliminação — LGPD art. 18, VI).
--   • ip pode ser anonimizado (truncamento do último octeto para IPv4,
--     ou do último bloco para IPv6) ao final do período de retenção
--     definido na política de privacidade do tenant (sugerido: 180 dias).
--
-- Exibição pública:
--   Somente comentários com status = 'aprovado' são expostos no portal.
--   O filtro é aplicado na camada de aplicação (NestJS); o RLS garante
--   apenas o isolamento entre tenants.
--
-- Login obrigatório:
--   autor_user_id é NOT NULL na camada de aplicação. O schema permite
--   NULL para preservar o histórico se a conta do cidadão for excluída
--   (ON DELETE SET NULL), mas a API deve rejeitar submissions sem
--   autenticação prévia.
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS para
-- que re-executar a migration não cause erro em nenhum ambiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela: noticia_comentarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noticia_comentarios (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant obrigatório.
  -- CASCADE remove os comentários quando o tenant é desativado/excluído.
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,

  -- Notícia à qual o comentário pertence.
  -- CASCADE remove os comentários quando a notícia é excluída.
  noticia_id      uuid        NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,

  -- Cidadão que comentou. Obrigatório na camada de aplicação (login).
  -- ON DELETE SET NULL: preserva o comentário (aprovado e publicado) mesmo
  -- que a conta do cidadão seja removida; autor_nome garante exibição.
  autor_user_id   uuid        REFERENCES users(id)             ON DELETE SET NULL,

  -- Snapshot do nome de exibição no momento da submissão.
  -- Evita JOIN com users e preserva o histórico mesmo após deleção da conta.
  -- Dado pessoal — ver seção LGPD acima.
  autor_nome      text        NOT NULL,

  -- Texto do comentário. Dado pessoal (pode conter PII).
  conteudo        text        NOT NULL,

  -- Ciclo de vida de moderação.
  -- pendente  → aguarda análise do moderador (estado inicial).
  -- aprovado  → visível no portal público.
  -- reprovado → rejeitado pelo moderador; não exibido.
  status          text        NOT NULL DEFAULT 'pendente'
                    CONSTRAINT ck_noticia_comentarios_status
                    CHECK (status IN ('pendente', 'aprovado', 'reprovado')),

  -- Moderador que alterou o status (nullable — pendente não tem moderador).
  moderado_por    uuid        REFERENCES users(id)             ON DELETE SET NULL,
  moderado_em     timestamptz,

  -- IP de origem para prevenção de abuso e auditoria de segurança.
  -- Dado pessoal (LGPD art. 5º, I). NÃO exibir publicamente.
  -- Retenção: anonimizar conforme política de privacidade do tenant.
  ip              text,

  criado_em       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Comentários de documentação
-- ---------------------------------------------------------------------
COMMENT ON TABLE noticia_comentarios IS
  'Comentários de cidadãos autenticados em notícias do portal. '
  'Moderação obrigatória (pendente→aprovado/reprovado) antes de exibição pública. '
  'Contém dados pessoais (nome, conteúdo livre, IP). '
  'Base legal: consentimento (LGPD art. 7º I) + interesse legítimo para IP (art. 7º IX). '
  'Por tenant com RLS; isolamento vetorial garantido.';

COMMENT ON COLUMN noticia_comentarios.autor_user_id IS
  'Cidadão autenticado que submeteu o comentário. '
  'Obrigatório na camada de app (login); NULL aqui preserva comentários publicados '
  'quando a conta é excluída (ON DELETE SET NULL).';

COMMENT ON COLUMN noticia_comentarios.autor_nome IS
  'Snapshot do nome de exibição no momento da submissão. '
  'Dado pessoal (LGPD art. 5º I). '
  'Garante exibição histórica mesmo após exclusão da conta do cidadão.';

COMMENT ON COLUMN noticia_comentarios.conteudo IS
  'Texto do comentário (dado pessoal — pode conter PII). '
  'Exibir publicamente SOMENTE após status = ''aprovado''. '
  'Cidadão tem direito de exclusão (LGPD art. 18 VI).';

COMMENT ON COLUMN noticia_comentarios.status IS
  'Ciclo de moderação: pendente (inicial) → aprovado | reprovado. '
  'Somente aprovados são visíveis no portal; filtro aplicado na camada de aplicação.';

COMMENT ON COLUMN noticia_comentarios.moderado_por IS
  'Usuário (gestor/admin) que aprovou ou reprovou o comentário. '
  'NULL enquanto status = ''pendente''.';

COMMENT ON COLUMN noticia_comentarios.ip IS
  'IP de origem (dado pessoal, LGPD art. 5º I). '
  'Finalidade: prevenção de abuso e auditoria de segurança. '
  'NUNCA exibir publicamente. '
  'Anonimizar após período de retenção definido na política de privacidade do tenant.';

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

-- Consulta mais frequente em produção: listar comentários aprovados de
-- uma notícia específica dentro do tenant (página pública da notícia).
-- Cobre o triplo filtro tenant_id + noticia_id + status em uma única varredura.
CREATE INDEX IF NOT EXISTS idx_noticia_comentarios_noticia_status
  ON noticia_comentarios (tenant_id, noticia_id, status);

-- Fila de moderação no painel admin: todos os pendentes/reprovados do tenant,
-- ordenados por data de criação. Cobre tenant_id + status sem fixar noticia_id.
CREATE INDEX IF NOT EXISTS idx_noticia_comentarios_tenant_status
  ON noticia_comentarios (tenant_id, status);

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
--     comentários de todos os tenants (necessário para auditoria LGPD).
--   • Sessões de tenant enxergam apenas comentários do próprio tenant.
--   • Sessões sem tenant_id definido (app_current_tenant() = NULL) não
--     enxergam nada.
--
-- Filtro adicional status = 'aprovado' para o canal público é aplicado
-- na camada de aplicação (NestJS), não em policy adicional de RLS —
-- mantendo semântica simples e evitando proliferação de policies.
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('noticia_comentarios');

-- ---------------------------------------------------------------------
-- GRANTs para portal_app e portal_ro
-- ---------------------------------------------------------------------
-- portal_app (role da API NestJS): CRUD completo.
--   SELECT  — listar comentários (fila de moderação + exibição pública).
--   INSERT  — cidadão submete novo comentário.
--   UPDATE  — moderador altera status (pendente → aprovado/reprovado).
--   DELETE  — cidadão exerce direito de eliminação (LGPD art. 18 VI)
--             ou admin remove conteúdo impróprio.
-- portal_ro (relatórios / DPO): somente leitura.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON noticia_comentarios TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON noticia_comentarios TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO
-- Executar em sessão de teste com o tenant 'exemplolandia'.
-- Substituir <UUID_TENANT_A>, <UUID_TENANT_B>, <UUID_NOTICIA_A>,
-- <UUID_USER_A>, <UUID_USER_B>, <UUID_MODERADOR_A> pelos UUIDs reais
-- do ambiente de teste (porta 5433 / container PostGIS).
-- NÃO executar em produção com dados reais.
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: modo plataforma para inserções de bootstrap
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

-- Comentário pendente do Tenant A
INSERT INTO noticia_comentarios
  (tenant_id, noticia_id, autor_user_id, autor_nome, conteudo, ip)
VALUES
  ('<UUID_TENANT_A>', '<UUID_NOTICIA_A>', '<UUID_USER_A>',
   'Cidadão Exemplar', 'Ótima notícia! Parabéns à equipe.', '192.0.2.1');

-- Segundo comentário pendente do Tenant A (mesmo usuário, outra notícia fictícia)
INSERT INTO noticia_comentarios
  (tenant_id, noticia_id, autor_user_id, autor_nome, conteudo, ip)
VALUES
  ('<UUID_TENANT_A>', '<UUID_NOTICIA_A>', '<UUID_USER_A>',
   'Cidadão Exemplar', 'Gostaria de saber mais sobre o assunto.', '192.0.2.1');

-- Comentário do Tenant B (para teste de isolamento)
INSERT INTO noticia_comentarios
  (tenant_id, noticia_id, autor_user_id, autor_nome, conteudo, ip)
VALUES
  ('<UUID_TENANT_B>', '<UUID_NOTICIA_A>', '<UUID_USER_B>',
   'Residente do Tenant B', 'Comentário do outro tenant.', '198.51.100.7');

-- -----------------------------------------------------------------------
-- TESTE 1: sessão do Tenant A enxerga apenas seus 2 comentários (espera 2)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_2_tenant_a FROM noticia_comentarios;

-- -----------------------------------------------------------------------
-- TESTE 2: Tenant A só tem 'pendentes' — aprovados = 0 (filtro de aplicação)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_0_aprovados
  FROM noticia_comentarios
 WHERE status = 'aprovado';

-- -----------------------------------------------------------------------
-- TESTE 3: sessão do Tenant B NÃO enxerga comentários do Tenant A (espera 1)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_1_tenant_b FROM noticia_comentarios;

-- -----------------------------------------------------------------------
-- TESTE 4: super_admin em modo plataforma vê todos os 3 (espera 3)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS deve_ser_3_plataforma FROM noticia_comentarios;

-- -----------------------------------------------------------------------
-- TESTE 5: sessão sem tenant definido não enxerga nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off', true);
  PERFORM set_config('app.current_tenant_id', '',    true);
END $$;

SELECT count(*) AS deve_ser_0_sem_tenant FROM noticia_comentarios;

-- -----------------------------------------------------------------------
-- TESTE 6: transição de status — moderador aprova um comentário do Tenant A
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE noticia_comentarios
   SET status       = 'aprovado',
       moderado_por = '<UUID_MODERADOR_A>',
       moderado_em  = now()
 WHERE tenant_id   = '<UUID_TENANT_A>'
   AND autor_nome  = 'Cidadão Exemplar'
   AND conteudo    = 'Ótima notícia! Parabéns à equipe.';

-- Confirma: agora há 1 aprovado e 1 pendente no Tenant A
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT status, count(*) AS qtd
  FROM noticia_comentarios
 GROUP BY status
 ORDER BY status;
-- Espera: aprovado=1, pendente=1

-- -----------------------------------------------------------------------
-- TESTE 7: reprovar o segundo comentário
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

UPDATE noticia_comentarios
   SET status       = 'reprovado',
       moderado_por = '<UUID_MODERADOR_A>',
       moderado_em  = now()
 WHERE tenant_id   = '<UUID_TENANT_A>'
   AND status      = 'pendente';

DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT status, count(*) AS qtd
  FROM noticia_comentarios
 GROUP BY status
 ORDER BY status;
-- Espera: aprovado=1, reprovado=1 (nenhum pendente restante)

-- -----------------------------------------------------------------------
-- TESTE 8: verificar que ip NÃO aparece em consulta "pública" simulada
-- (a aplicação deve SELECT sem a coluna ip; aqui apenas documentamos
--  que a coluna existe mas não deve ser retornada em queries públicas)
-- -----------------------------------------------------------------------
SELECT id, autor_nome, conteudo, criado_em   -- ip AUSENTE intencionalmente
  FROM noticia_comentarios
 WHERE status = 'aprovado';

-- -----------------------------------------------------------------------
-- TESTE 9: verificar índices no catálogo
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'noticia_comentarios'
 ORDER BY indexname;
-- Espera:
--   idx_noticia_comentarios_noticia_status  (tenant_id, noticia_id, status)
--   idx_noticia_comentarios_tenant_status   (tenant_id, status)
--   noticia_comentarios_pkey                (id)

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM noticia_comentarios
 WHERE tenant_id IN ('<UUID_TENANT_A>', '<UUID_TENANT_B>');

*/
