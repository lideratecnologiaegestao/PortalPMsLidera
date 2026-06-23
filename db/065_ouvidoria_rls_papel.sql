-- =====================================================================
-- 065 — RLS por papel para o módulo de Ouvidoria/e-SIC (ADR-0005 Fase 1)
-- =====================================================================
--
-- DECISÃO ARQUITETURAL — separação de INSERT e SELECT/UPDATE/DELETE
-- -----------------------------------------------------------------------
-- O cidadão abre uma manifestação pela rota pública. Nesse fluxo, a API
-- seta `app.current_tenant_id` mas NÃO seta `app.current_user_role`
-- (o cidadão não tem papel de funcionário). Se usássemos uma única policy
-- USING+WITH CHECK restrita a 'ouvidor'/'assistente_ouvidoria', o INSERT
-- do cidadão seria bloqueado pelo WITH CHECK.
--
-- Solução: políticas separadas por comando (FOR INSERT / FOR SELECT,UPDATE,DELETE).
--
--   FOR INSERT  → apenas tenant_id correto (cidadão e ouvidor podem abrir)
--                 Plataforma (jobs/worker) passa pelo app_is_platform().
--
--   FOR SELECT  → apenas plataforma OU (tenant correto E papel ouvidor/assistente)
--   FOR UPDATE  → idem
--   FOR DELETE  → idem (na prática nunca delete, mas a barreira existe)
--
-- Consequência direta: um 'admin_prefeitura', 'ti', 'servidor' ou sessão
-- sem papel definido recebe 0 linhas em qualquer SELECT de manifestação —
-- satisfazendo o requisito crítico do ADR-0005.
--
-- TABELAS AFETADAS (todas têm tenant_id — nenhuma filha sem tenant_id):
--   manifestacoes, manifestacao_eventos, manifestacao_anexos,
--   manifestacao_mensagens, pesquisa_satisfacao
--
-- NOTA SOBRE pesquisa_satisfacao:
--   O cidadão TAMBÉM preenche a pesquisa (pós-conclusão). A policy de INSERT
--   nessa tabela segue o mesmo padrão: aceita qualquer role desde que o
--   tenant_id bata. Leitura fica restrita a ouvidor/assistente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funções auxiliares de contexto de papel (STABLE = cacheável por query)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_user_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_secretaria_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_secretaria_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabela: manifestacoes
--    A policy padrão criada pela macro chama-se 'tenant_isolation'.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON manifestacoes;

-- INSERT: cidadão (sem role) ou ouvidor/assistente — basta tenant correto.
CREATE POLICY ouvidoria_insert ON manifestacoes
  FOR INSERT
  WITH CHECK (
    app_is_platform()
    OR tenant_id = app_current_tenant()
  );

-- SELECT / UPDATE / DELETE: restrito a ouvidor e assistente_ouvidoria.
CREATE POLICY ouvidoria_isolation ON manifestacoes
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_update ON manifestacoes
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_delete ON manifestacoes
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

-- ---------------------------------------------------------------------
-- 3. Tabela: manifestacao_eventos  (tem tenant_id)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON manifestacao_eventos;

CREATE POLICY ouvidoria_insert ON manifestacao_eventos
  FOR INSERT
  WITH CHECK (
    app_is_platform()
    OR tenant_id = app_current_tenant()
  );

CREATE POLICY ouvidoria_isolation ON manifestacao_eventos
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_update ON manifestacao_eventos
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_delete ON manifestacao_eventos
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

-- ---------------------------------------------------------------------
-- 4. Tabela: manifestacao_anexos  (tem tenant_id)
--    INSERT: cidadão faz upload de anexo ao abrir/complementar; qualquer
--    sessão com tenant correto pode inserir.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON manifestacao_anexos;

CREATE POLICY ouvidoria_insert ON manifestacao_anexos
  FOR INSERT
  WITH CHECK (
    app_is_platform()
    OR tenant_id = app_current_tenant()
  );

CREATE POLICY ouvidoria_isolation ON manifestacao_anexos
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_update ON manifestacao_anexos
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_delete ON manifestacao_anexos
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

-- ---------------------------------------------------------------------
-- 5. Tabela: manifestacao_mensagens  (tem tenant_id — migration 021)
--    INSERT: cidadão envia mensagem no chat de acompanhamento.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON manifestacao_mensagens;

CREATE POLICY ouvidoria_insert ON manifestacao_mensagens
  FOR INSERT
  WITH CHECK (
    app_is_platform()
    OR tenant_id = app_current_tenant()
  );

CREATE POLICY ouvidoria_isolation ON manifestacao_mensagens
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_update ON manifestacao_mensagens
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_delete ON manifestacao_mensagens
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

-- ---------------------------------------------------------------------
-- 6. Tabela: pesquisa_satisfacao  (tem tenant_id — migration 021)
--    INSERT: cidadão preenche ao final. Sem restrição de papel no INSERT.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON pesquisa_satisfacao;

CREATE POLICY ouvidoria_insert ON pesquisa_satisfacao
  FOR INSERT
  WITH CHECK (
    app_is_platform()
    OR tenant_id = app_current_tenant()
  );

CREATE POLICY ouvidoria_isolation ON pesquisa_satisfacao
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_update ON pesquisa_satisfacao
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

CREATE POLICY ouvidoria_delete ON pesquisa_satisfacao
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
    )
  );

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO (executar em sessão de teste — NÃO em produção
-- sem rever os tenant_id e dados reais)
-- =====================================================================
/*

-- Preparação: dois tenants de teste
-- Tenant A = 'exemplolandia' (use o UUID real do seu ambiente)
-- Tenant B = qualquer outro tenant existente

-- -----------------------------------------------------------------------
-- TESTE 1: ouvidor do Tenant A vê manifestações do seu tenant (espera > 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor', true);
END $$;

SELECT count(*) AS deve_ser_maior_que_0 FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 2: admin_prefeitura do Tenant A NÃO vê nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'admin_prefeitura', true);
END $$;

SELECT count(*) AS deve_ser_0 FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 3: role 'ti' NÃO vê nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'ti',     true);
END $$;

SELECT count(*) AS deve_ser_0 FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 4: role vazia (cidadão sem papel) NÃO vê nada (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', '',       true);
END $$;

SELECT count(*) AS deve_ser_0 FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 5: assistente_ouvidoria do Tenant A vê as manifestações (espera > 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'assistente_ouvidoria', true);
END $$;

SELECT count(*) AS deve_ser_maior_que_0 FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 6: ouvidor do Tenant A NÃO vê manifestações do Tenant B (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor', true);
END $$;

-- deve retornar apenas as do Tenant B (se houver) — isolamento entre tenants mantido
SELECT count(*) AS apenas_do_tenant_b FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 7: cidadão pode INSERIR manifestação (sem papel definido)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',    true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', '',       true);
END $$;

-- INSERT deve ter sucesso (WITH CHECK do ouvidoria_insert só exige tenant_id correto)
INSERT INTO manifestacoes (
  tenant_id, protocolo, canal, tipo, anonima,
  assunto, descricao, prazo_em
) VALUES (
  '<UUID_TENANT_A>',
  'TESTE-' || extract(epoch from now())::text,
  'ouvidoria', 'reclamacao', true,
  'Teste RLS INSERT cidadão',
  'Verificação de que cidadão sem role pode abrir manifestação.',
  now() + interval '30 days'
);

-- Confirma que o cidadão NÃO pode ler de volta (espera 0)
SELECT count(*) AS deve_ser_0_cidadao_nao_le FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE 8: plataforma (worker/job) vê tudo (espera total global)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS total_plataforma FROM manifestacoes;

*/
