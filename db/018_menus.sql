-- =====================================================================
-- 018 — Menus dinâmicos do portal (multi-tenant, RLS)
-- =====================================================================
-- Sistema de menus configuráveis por tenant. Cada prefeitura define
-- seus próprios itens de menu (cabeçalho e rodapé) com hierarquia via
-- auto-referência (parent_id). Um item sem parent_id é raiz; com filhos
-- funciona como dropdown/grupo.
--
-- Tipos de item:
--   interno — rota interna do portal ('/transparencia', '/<slug>')
--   externo — URL absoluta (outro site, portal de serviços externo)
--   grupo   — container sem link próprio; só agrupa filhos em dropdown
--
-- Auto-cadastro: ao criar uma página ou secretaria, o módulo CMS insere
-- automaticamente um item com ref_tipo='pagina'|'secretaria' e ref_id
-- apontando para a entidade original. Ao excluir a entidade, o item
-- de menu é excluído em cascata via ON DELETE CASCADE na FK da tabela
-- de origem (ou via lógica de aplicação usando ref_tipo + ref_id).
--
-- Depende: 001 (app_enable_tenant_rls, tenants)
-- Idempotente: usa IF NOT EXISTS em tabela e índices; enums usam bloco
--              DO com verificação em pg_type antes de CREATE TYPE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums (idempotentes via DO block)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'menu_local') THEN
    CREATE TYPE menu_local AS ENUM ('cabecalho', 'rodape');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'menu_tipo') THEN
    CREATE TYPE menu_tipo AS ENUM ('interno', 'externo', 'grupo');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabela menu_items
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   uuid        REFERENCES menu_items(id) ON DELETE CASCADE,
  local       menu_local  NOT NULL DEFAULT 'cabecalho',
  label       text        NOT NULL,
  tipo        menu_tipo   NOT NULL DEFAULT 'interno',
  href        text,                          -- NULL válido para tipo='grupo'
  icone       text,                          -- nome do ícone (ex.: 'FileText', 'Building2')
  ordem       integer     NOT NULL DEFAULT 0,
  ativo       boolean     NOT NULL DEFAULT true,
  ref_tipo    text,                          -- 'pagina' | 'secretaria' | NULL (manual)
  ref_id      uuid,                          -- id da entidade de origem (auto-cadastro)
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Comentários de coluna para documentação inline
COMMENT ON TABLE  menu_items          IS 'Itens de menu configuráveis por tenant (cabeçalho e rodapé). Hierarquia via parent_id.';
COMMENT ON COLUMN menu_items.parent_id IS 'Item pai. NULL = item raiz. Itens com filhos formam dropdowns.';
COMMENT ON COLUMN menu_items.tipo     IS 'interno=rota interna; externo=URL absoluta; grupo=container sem link.';
COMMENT ON COLUMN menu_items.href     IS 'Rota (/transparencia) ou URL externa. NULL obrigatório para tipo=grupo.';
COMMENT ON COLUMN menu_items.ref_tipo IS 'Origem do auto-cadastro: pagina | secretaria | NULL (item manual).';
COMMENT ON COLUMN menu_items.ref_id   IS 'PK da entidade de origem para limpeza quando a entidade for excluída.';

-- ---------------------------------------------------------------------
-- 3. Índices
-- ---------------------------------------------------------------------

-- Query principal: buscar todos os itens de um local para montar o menu
-- ordenados por posição (inclui parent_id para agrupar hierarquia em memória)
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_local_parent_ordem
  ON menu_items (tenant_id, local, parent_id, ordem);

-- Query de reconciliação: ao excluir/atualizar página ou secretaria,
-- localiza o item gerado automaticamente para excluir ou atualizar o href
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_ref
  ON menu_items (tenant_id, ref_tipo, ref_id);

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
SELECT app_enable_tenant_rls('menu_items');

-- ---------------------------------------------------------------------
-- 5. GRANTs explícitos
-- Garante acesso mesmo quando o superusuário criou as tabelas fora do
-- contexto do role portal_app (complementa ALTER DEFAULT PRIVILEGES).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON menu_items TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON menu_items TO portal_ro';
  END IF;
END;
$$;
