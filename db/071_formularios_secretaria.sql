-- =====================================================================
-- 071 — ADR-0005 Fase 4 — Vincular formulários a secretarias
--       (formularios.secretaria_id)
-- =====================================================================
--
-- CONTEXTO
-- --------
-- A migration 034 (secretaria_completa) adicionou `secretaria_id` às
-- tabelas `noticias`, `documentos` e `galeria_itens`, permitindo que
-- esses registros apareçam tanto no portal principal quanto na página
-- específica da secretaria (item compartilhado, nullable).
-- A tabela `formularios` (migration 049) ficou fora desse padrão. Esta
-- migration corrige a lacuna: adiciona `secretaria_id` nullable com a
-- mesma semântica — null significa "formulário do portal / sem lotação".
--
-- DECISÃO DE RLS
-- --------------
-- O RLS de `formularios` PERMANECE inalterado: policy `tenant_isolation`
-- por tenant_id, exatamente como em `noticias`, `documentos` e
-- `galeria_itens`. O escopo por secretaria (filtrar formulários da
-- secretaria X) é responsabilidade da camada de aplicação, via cláusula
-- WHERE secretaria_id = :id nas queries da API. Essa separação de
-- responsabilidades é deliberada e coerente com o padrão já estabelecido
-- nas outras tabelas compartilhadas:
--   • RLS garante isolamento entre tenants (quem pode ver).
--   • Aplicação garante escopo por secretaria (o que mostrar).
-- Não alterar o RLS evita a criação de políticas compostas que tornariam
-- as queries mais lentas e o comportamento de `super_admin` / modo
-- plataforma mais complexo de raciocinar.
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS para que
-- re-executar a migration não cause erro em nenhum ambiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Adicionar coluna secretaria_id à tabela formularios
-- ---------------------------------------------------------------------
-- nullable: NULL = formulário do portal principal (sem lotação em
-- secretaria específica). ON DELETE SET NULL preserva o formulário
-- mesmo que a secretaria seja removida — igual ao padrão de noticias e
-- documentos (migration 034).
ALTER TABLE formularios
  ADD COLUMN IF NOT EXISTS secretaria_id uuid
    REFERENCES secretarias(id) ON DELETE SET NULL;

COMMENT ON COLUMN formularios.secretaria_id IS
  'Secretaria à qual o formulário está vinculado (nullable). '
  'NULL = formulário do portal principal / sem lotação. '
  'Mesmo padrão de compartilhamento de noticias, documentos e galeria_itens (migration 034). '
  'O escopo por secretaria é aplicado na camada de aplicação; RLS permanece por tenant_id.';

-- ---------------------------------------------------------------------
-- 2. Índice composto (tenant_id, secretaria_id)
-- ---------------------------------------------------------------------
-- Cobre o filtro mais frequente em produção: buscar todos os formulários
-- publicados de uma secretaria dentro do tenant ativo.
-- O índice existente idx_formularios_tenant (tenant_id, status) cobre
-- listagens gerais; este é específico para o filtro de secretaria.
CREATE INDEX IF NOT EXISTS idx_formularios_secretaria
  ON formularios (tenant_id, secretaria_id);

-- =====================================================================
-- BLOCO DE VERIFICAÇÃO
-- Executar em sessão de teste contra o banco local (Docker / porta 5433).
-- Usar o tenant 'exemplolandia' para testes. Substituir <UUID_TENANT_A>,
-- <UUID_TENANT_B>, <UUID_SECRETARIA_A> pelos UUIDs reais do ambiente.
-- NÃO executar em produção.
-- =====================================================================
/*

-- -----------------------------------------------------------------------
-- Preparação: dois tenants (A = exemplolandia, B = outro tenant existente)
-- -----------------------------------------------------------------------

-- Inserir formulário COM secretaria_id no Tenant A
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

INSERT INTO formularios
  (tenant_id, slug, titulo, status, secretaria_id)
VALUES
  ('<UUID_TENANT_A>', 'form-sec-obras', 'Solicitação de Obras',
   'publicado', '<UUID_SECRETARIA_A>');

-- Inserir formulário SEM secretaria_id (portal principal) no Tenant A
INSERT INTO formularios
  (tenant_id, slug, titulo, status)
VALUES
  ('<UUID_TENANT_A>', 'form-portal', 'Contato Geral', 'publicado');

-- -----------------------------------------------------------------------
-- TESTE 1: sessão do Tenant A enxerga os dois formulários (espera 2)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_A>', true);
END $$;

SELECT count(*) AS deve_ser_2 FROM formularios;

-- -----------------------------------------------------------------------
-- TESTE 2: filtro por secretaria retorna apenas 1 (escopo de aplicação)
-- -----------------------------------------------------------------------
SELECT count(*) AS deve_ser_1_secretaria
  FROM formularios
 WHERE secretaria_id = '<UUID_SECRETARIA_A>';

-- Formulário sem lotação:
SELECT count(*) AS deve_ser_1_sem_secretaria
  FROM formularios
 WHERE secretaria_id IS NULL;

-- -----------------------------------------------------------------------
-- TESTE 3: sessão do Tenant B NÃO enxerga formulários do Tenant A (espera 0)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform',       'off',             true);
  PERFORM set_config('app.current_tenant_id', '<UUID_TENANT_B>', true);
END $$;

SELECT count(*) AS deve_ser_0_tenant_b FROM formularios;

-- -----------------------------------------------------------------------
-- TESTE 4: super_admin em modo plataforma vê todos os formulários (espera >= 2)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

SELECT count(*) AS total_plataforma FROM formularios;

-- -----------------------------------------------------------------------
-- TESTE 5: verificar que a coluna e o índice existem no catálogo
-- -----------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'formularios'
   AND column_name = 'secretaria_id';
-- Espera: 1 linha, data_type = uuid, is_nullable = YES

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'formularios'
   AND indexname = 'idx_formularios_secretaria';
-- Espera: 1 linha com definição ON (tenant_id, secretaria_id)

-- -----------------------------------------------------------------------
-- Limpeza do teste
-- -----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);
END $$;

DELETE FROM formularios
 WHERE tenant_id = '<UUID_TENANT_A>'
   AND slug IN ('form-sec-obras', 'form-portal');

*/
