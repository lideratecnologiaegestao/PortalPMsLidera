-- =====================================================================
-- 062 — Documentação LGPD por entidade (gerada + publicável)
-- =====================================================================
-- A plataforma mantém um TEMPLATE global da documentação LGPD (4 documentos:
-- Política de Privacidade, PSI, RoPA e Relatório de Medidas) com placeholders.
-- Esta tabela guarda, por tenant, a documentação GERADA (template + dados da
-- entidade) e o estado de PUBLICAÇÃO na página pública /privacidade/sobre-lgpd.
--
-- Fluxo:
--   1. super_admin edita o template global (platform_settings.dados.lgpd).
--   2. super_admin (no Gerenciador) OU o responsável da entidade clica
--      "Gerar LGPD" → renderiza o template com os dados do tenant e grava o HTML.
--   3. O responsável baixa em PDF/TXT/HTML e PUBLICA em /privacidade/sobre-lgpd.
--
-- O template global NÃO fica aqui (é único e vive em platform_settings). Aqui só
-- o resultado por entidade + os dados complementares usados na geração.
--
-- Segurança: RLS por tenant (app_enable_tenant_rls) — o super_admin escreve
-- cross-tenant via TenantContext.run({ tenantId }); a entidade só vê o seu.
-- Sem dado pessoal sensível: dpo_* e responsável são dados funcionais/públicos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS lgpd_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  -- Dados complementares usados na geração (não cobertos por tenants):
  -- dpoTelefone, dpoEndereco, enderecoEntidade, municipio,
  -- responsavelNome, responsavelCargo.
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  html          text,                                   -- documentação renderizada
  versao        integer     NOT NULL DEFAULT 1,
  publicado     boolean     NOT NULL DEFAULT false,
  publicado_em  timestamptz,
  gerado_em     timestamptz,
  gerado_por    uuid        REFERENCES users(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  lgpd_documentos IS 'Documentação LGPD gerada por entidade (template global + dados do tenant) e seu estado de publicação na página /privacidade/sobre-lgpd.';
COMMENT ON COLUMN lgpd_documentos.dados IS 'Dados complementares da geração (dpoTelefone, dpoEndereco, enderecoEntidade, municipio, responsavelNome, responsavelCargo).';
COMMENT ON COLUMN lgpd_documentos.html IS 'HTML renderizado da documentação completa (4 documentos).';
COMMENT ON COLUMN lgpd_documentos.publicado IS 'Quando true, a página pública /privacidade/sobre-lgpd exibe o documento.';

SELECT app_enable_tenant_rls('lgpd_documentos');
