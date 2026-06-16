-- =====================================================================
-- 056 — Config de IA por tenant (override opcional sobre o global)
-- =====================================================================
-- Permite individualizar por entidade, no Gerenciador da Plataforma:
--   - ia_max_chunks: teto do corpus vetorial (NULL = usa o default global).
--   - embeddings_provider: 'voyage' | 'openai' (NULL = usa o global/env).
--   - chaves de IA CIFRADAS (secret-box, AES-256-GCM) — NULL = usa o .env
--     global. "Global + override opcional": a entidade só sobrepõe o que
--     preencher; o resto continua caindo nas variáveis de ambiente.
-- Segredo NUNCA em texto plano nem em log; a API só devolve mascarado.
-- Ver docs/adr/ADR-0001-config-por-entidade.md.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_ia_config (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  ia_max_chunks             integer,                 -- NULL = default global
  embeddings_provider       text,                    -- NULL = global/env
  voyage_api_key_cifrado    text,                    -- cifrado (secret-box) | NULL = env
  anthropic_api_key_cifrado text,                    -- cifrado | NULL = env
  openai_api_key_cifrado    text,                    -- cifrado | NULL = env
  ativo                     boolean     NOT NULL DEFAULT true,
  atualizado_em             timestamptz NOT NULL DEFAULT now(),
  criado_em                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tic_provider_chk  CHECK (embeddings_provider IS NULL OR embeddings_provider IN ('voyage','openai')),
  CONSTRAINT tic_maxchunks_chk CHECK (ia_max_chunks IS NULL OR (ia_max_chunks >= 100 AND ia_max_chunks <= 50000))
);

COMMENT ON TABLE  tenant_ia_config IS 'Configuração de IA por tenant: override opcional de limite/provedor/chaves sobre o global (.env). Chaves cifradas em repouso (secret-box).';
COMMENT ON COLUMN tenant_ia_config.ia_max_chunks IS 'Teto de chunks do corpus vetorial. NULL = usa o default global do indexador.';

SELECT app_enable_tenant_rls('tenant_ia_config');
