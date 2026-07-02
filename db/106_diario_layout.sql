-- =====================================================================
-- 106 — Diário Oficial: layout configurável + base de hinos estaduais
-- =====================================================================
-- (1) diario_config — por tenant (RLS): nº de colunas do corpo (1|2),
--     cabeçalho (brasão+nome) e rodapé (nome/endereço/horário/CNPJ) do PDF,
--     e se inclui as páginas finais de hinos.
-- (2) hinos_estaduais — base GLOBAL (símbolos oficiais dos estados; iguais para
--     todos os tenants). O hino do estado do município entra automático pela UF.
--     Semeada na migração 107. Hino do Município + brasão vêm de `hino_brasao`;
--     Hino Nacional e Hino à Bandeira são textos fixos no gerador do PDF.
-- =====================================================================

CREATE TABLE IF NOT EXISTS diario_config (
  tenant_id           uuid        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  colunas             int         NOT NULL DEFAULT 2 CHECK (colunas IN (1, 2)),
  cabecalho_ativo     boolean     NOT NULL DEFAULT true,   -- brasão + nome da entidade
  rodape_ativo        boolean     NOT NULL DEFAULT true,   -- nome/endereço/horário/CNPJ
  incluir_hinos       boolean     NOT NULL DEFAULT true,   -- páginas finais com hinos
  endereco            text,                                -- rodapé (não existe no tenant)
  horario_atendimento text,                                -- rodapé
  telefone            text,                                -- rodapé
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('diario_config');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON diario_config TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    GRANT SELECT ON diario_config TO portal_ro;
  END IF;
END$$;

-- ---- Base GLOBAL de hinos estaduais (referência; não tenant-scoped) --------
CREATE TABLE IF NOT EXISTS hinos_estaduais (
  uf            char(2)     PRIMARY KEY,
  estado        text        NOT NULL,
  titulo        text        NOT NULL,
  letra         text,                              -- null quando não há hino oficial c/ letra
  autores       text,
  fonte         text,
  oficial       boolean     NOT NULL DEFAULT true, -- ex.: MG não tem hino oficial → false
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
-- Referência global read-only para a aplicação (seed por superusuário na 107).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT ON hinos_estaduais TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    GRANT SELECT ON hinos_estaduais TO portal_ro;
  END IF;
END$$;
