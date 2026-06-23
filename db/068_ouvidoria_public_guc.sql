-- =====================================================================
-- 068 — ADR-0005 Fase 1 — GUC público para fluxos do cidadão na Ouvidoria
-- =====================================================================
--
-- CONTEXTO
-- --------
-- A migration 065 restringiu SELECT/UPDATE/DELETE das tabelas de ouvidoria
-- a app_current_user_role() IN ('ouvidor','assistente_ouvidoria'). Isso é
-- correto para o staff, mas quebra os fluxos PÚBLICOS do cidadão:
--
--   • registrar()   → RETURNING depois do INSERT (SELECT implícito)
--   • acompanhar()  → SELECT por protocolo+chave
--   • mensagemCidadao() / avaliar() / anexoCidadao() / recursoCidadao()
--     → SELECT (autorizar) + INSERT/UPDATE em tabelas filhas
--
-- SOLUÇÃO (ver ADR-0005)
-- -------
-- Adicionar ao USING/WITH CHECK das policies de SELECT/UPDATE/DELETE um
-- predicado extra:
--
--   OR current_setting('app.public_ouvidoria', true) = 'on'
--
-- O GUC é setado via SET LOCAL dentro de uma transação, e só é ativado
-- pelos métodos de serviço públicos APÓS validar protocolo+chave (camada
-- de app). O isolamento por tenant_id = app_current_tenant() é MANTIDO em
-- todos os predicados — o GUC público nunca autoriza cross-tenant.
--
-- GARANTIAS
-- ---------
-- • Isolamento de tenant: tenant_id = app_current_tenant() permanece em
--   TODOS os USING/WITH CHECK. O GUC só afeta o filtro de papel.
-- • Não há acesso cross-tenant: a outra condição do AND não é removida.
-- • O GUC é LOCAL (vale só dentro da transação): pool de conexões seguro.
-- • INSERT não é alterado: já era aberto a qualquer sessão com tenant certo.
-- • admin_prefeitura / ti / servidor SEM o GUC ativo continuam recebendo
--   0 linhas (isolamento de papel preservado).
-- • Esta migration é IDEMPOTENTE: DROP POLICY IF EXISTS antes de recriar.
--
-- DEPLOY
-- ------
-- Aplicar JUNTO com db/065_ouvidoria_rls_papel.sql (ou após, se 065 já
-- estiver em produção). Não requer reinício da API — apenas reload do RLS.
-- =====================================================================

-- -----------------------------------------------------------------------
-- Helper: função para testar o GUC público (cacheável por query)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_is_public_ouvidoria() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.public_ouvidoria', true) = 'on';
$$;

-- -----------------------------------------------------------------------
-- 1. manifestacoes
-- -----------------------------------------------------------------------

-- SELECT
DROP POLICY IF EXISTS ouvidoria_isolation ON manifestacoes;
CREATE POLICY ouvidoria_isolation ON manifestacoes
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS ouvidoria_update ON manifestacoes;
CREATE POLICY ouvidoria_update ON manifestacoes
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- DELETE (barreira de segurança — na prática nunca deletamos)
DROP POLICY IF EXISTS ouvidoria_delete ON manifestacoes;
CREATE POLICY ouvidoria_delete ON manifestacoes
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- -----------------------------------------------------------------------
-- 2. manifestacao_eventos
-- -----------------------------------------------------------------------

DROP POLICY IF EXISTS ouvidoria_isolation ON manifestacao_eventos;
CREATE POLICY ouvidoria_isolation ON manifestacao_eventos
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_update ON manifestacao_eventos;
CREATE POLICY ouvidoria_update ON manifestacao_eventos
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_delete ON manifestacao_eventos;
CREATE POLICY ouvidoria_delete ON manifestacao_eventos
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- -----------------------------------------------------------------------
-- 3. manifestacao_anexos
-- -----------------------------------------------------------------------

DROP POLICY IF EXISTS ouvidoria_isolation ON manifestacao_anexos;
CREATE POLICY ouvidoria_isolation ON manifestacao_anexos
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_update ON manifestacao_anexos;
CREATE POLICY ouvidoria_update ON manifestacao_anexos
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_delete ON manifestacao_anexos;
CREATE POLICY ouvidoria_delete ON manifestacao_anexos
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- -----------------------------------------------------------------------
-- 4. manifestacao_mensagens
-- -----------------------------------------------------------------------

DROP POLICY IF EXISTS ouvidoria_isolation ON manifestacao_mensagens;
CREATE POLICY ouvidoria_isolation ON manifestacao_mensagens
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_update ON manifestacao_mensagens;
CREATE POLICY ouvidoria_update ON manifestacao_mensagens
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_delete ON manifestacao_mensagens;
CREATE POLICY ouvidoria_delete ON manifestacao_mensagens
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- -----------------------------------------------------------------------
-- 5. pesquisa_satisfacao
-- -----------------------------------------------------------------------

DROP POLICY IF EXISTS ouvidoria_isolation ON pesquisa_satisfacao;
CREATE POLICY ouvidoria_isolation ON pesquisa_satisfacao
  FOR SELECT
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_update ON pesquisa_satisfacao;
CREATE POLICY ouvidoria_update ON pesquisa_satisfacao
  FOR UPDATE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  )
  WITH CHECK (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

DROP POLICY IF EXISTS ouvidoria_delete ON pesquisa_satisfacao;
CREATE POLICY ouvidoria_delete ON pesquisa_satisfacao
  FOR DELETE
  USING (
    app_is_platform()
    OR (
      tenant_id = app_current_tenant()
      AND (
        app_current_user_role() IN ('ouvidor', 'assistente_ouvidoria')
        OR app_is_public_ouvidoria()
      )
    )
  );

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO (executar em sessão de teste — NÃO em produção
-- sem rever os tenant_id e dados reais)
-- =====================================================================
/*

-- Preparação: use o tenant 'exemplolandia' (UUID real do ambiente)
-- Tenant A = exemplolandia; Tenant B = outro tenant existente

-- -----------------------------------------------------------------------
-- TESTE A: cidadão (sem papel) COM GUC público ativo vê sua manifestação
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', '',     true);
  PERFORM set_config('app.public_ouvidoria',  'on',   true);
END $$;

SELECT count(*) AS deve_ser_maior_que_0_cidadao_guc FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE B: cidadão SEM GUC público ainda recebe 0 (sem papel)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', '',     true);
  PERFORM set_config('app.public_ouvidoria',  'off',  true);
END $$;

SELECT count(*) AS deve_ser_0_sem_guc FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE C: admin_prefeitura SEM GUC público ainda recebe 0
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'admin_prefeitura', true);
  PERFORM set_config('app.public_ouvidoria',  'off',  true);
END $$;

SELECT count(*) AS deve_ser_0_admin_sem_guc FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE D: GUC público ativo NO TENANT ERRADO não vazou cross-tenant
-- (o cidadão do tenant A com GUC ativo NÃO vê dados do tenant B)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
  PERFORM set_config('app.current_user_role', '',     true);
  PERFORM set_config('app.public_ouvidoria',  'on',   true);
END $$;

-- Deve retornar apenas manifestações do Tenant B (se houver) — isolamento preservado.
SELECT count(*) AS apenas_do_tenant_b FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE E: ouvidor SEM GUC ativo ainda funciona (caminho normal do staff)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'ouvidor', true);
  PERFORM set_config('app.public_ouvidoria',  'off',  true);
END $$;

SELECT count(*) AS deve_ser_maior_que_0_ouvidor FROM manifestacoes;

-- -----------------------------------------------------------------------
-- TESTE F: assistente_ouvidoria SEM GUC ativo ainda funciona
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',  true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
  PERFORM set_config('app.current_user_role', 'assistente_ouvidoria', true);
  PERFORM set_config('app.public_ouvidoria',  'off',  true);
END $$;

SELECT count(*) AS deve_ser_maior_que_0_assistente FROM manifestacoes;

*/
