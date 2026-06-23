-- =====================================================================
-- 081 — Multi-número WhatsApp (Meta) por tenant
-- =====================================================================
--
-- PROPÓSITO
-- ---------
-- Permite que cada prefeitura configure N números Meta na mesma conta
-- (ex.: canal geral + canal de saúde + canal de ouvidoria). Casos de
-- uso incluem editais que exigem até 30 números distintos por WABA.
--
-- Esta tabela NÃO substitui tenant_whatsapp_config (migration 052),
-- que continua servindo como registro único/retrocompat para Z-API e
-- Evolution API com provider único por tenant. tenant_whatsapp_canais
-- é ADICIONAL e trata exclusivamente o cenário multi-número Meta.
--
-- RESOLUÇÃO DO CANAL NO WEBHOOK
-- ------------------------------
-- O webhook da Meta recebe mensagens em POST /webhooks/meta/c/:secret.
-- O campo webhook_secret (UNIQUE GLOBAL) identifica inequivocamente
-- qual canal e tenant gerou o evento, ANTES de qualquer TenantContext.
-- A busca cross-tenant é feita pela API com prisma.platform() —
-- nenhuma policy RLS especial é necessária para esse lookup.
--
-- ROTEAMENTO DE RESPOSTA
-- ----------------------
-- canal_id em atendimento_conversas guarda o canal que originou a
-- conversa; a API usa esse FK para enviar a resposta pelo mesmo número
-- Meta (sem misturar canais distintos no mesmo thread).
--
-- ISOLAMENTO RLS
-- --------------
-- app_enable_tenant_rls() aplica a policy padrão do projeto:
--   USING (app_is_platform() OR tenant_id = app_current_tenant())
-- As colunas cifradas (meta_token_cifrado, meta_app_secret_cifrado)
-- nunca aparecem em logs nem são expostas pela API sem máscara.
--
-- LGPD
-- ----
-- Nenhum dado pessoal do cidadão é armazenado aqui. Os campos cifrados
-- são credenciais operacionais da prefeitura (controladora). Base legal:
-- LGPD art. 7º, III (interesse legítimo da Administração Pública).
--
-- IDEMPOTÊNCIA
-- ------------
-- Toda instrução usa IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS.
-- Aplicar como superusuário postgres (executa app_enable_tenant_rls).
-- =====================================================================

-- =====================================================================
-- Tabela: tenant_whatsapp_canais
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenant_whatsapp_canais (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant. CASCADE remove todos os canais junto com
  -- o tenant (off-boarding / exclusão de entidade).
  tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Rótulo amigável exibido no painel admin e nos logs de atendimento.
  -- Exemplos: 'Geral', 'Saúde', 'Ouvidoria'.
  label                   text        NOT NULL,

  -- Provider reservado; CHECK garante que apenas 'meta' é válido aqui.
  -- Se outros providers multi-número forem suportados, criar migration
  -- específica para ampliar o CHECK (mudança destrutiva controlada).
  provider                text        NOT NULL DEFAULT 'meta',

  -- Credenciais Meta Cloud API —————————————————————————————————————————
  -- ID do número de telefone (Graph API endpoint: /{id}/messages).
  meta_phone_number_id    text,

  -- WhatsApp Business Account ID (opcional; útil para multi-WABA).
  meta_waba_id            text,

  -- Access token do System User Meta — cifrado com secret-box (AES-256-GCM).
  -- Nunca logar; nunca retornar sem máscara.
  meta_token_cifrado      text,

  -- App Secret — cifrado. Usado para validar X-Hub-Signature-256.
  meta_app_secret_cifrado text,

  -- Token do handshake de verificação do webhook (GET hub.verify_token).
  meta_verify_token       text,

  -- Segredo aleatório (32 bytes hex) embutido no path do webhook:
  --   POST /webhooks/meta/c/:webhook_secret
  -- UNIQUE GLOBAL: resolve o canal e o tenant sem ambiguidade, antes da
  -- validação da assinatura HMAC. Busca feita com prisma.platform().
  webhook_secret          text        NOT NULL,

  -- Secretaria responsável (opcional). Se SET NULL: o canal volta a ser
  -- "geral" sem secretaria vinculada. Útil para roteamento de triagem.
  secretaria_id           uuid        REFERENCES secretarias(id) ON DELETE SET NULL,

  -- Controle operacional.
  ativo                   boolean     NOT NULL DEFAULT true,
  ordem                   int         NOT NULL DEFAULT 0,

  -- Auditoria de ciclo de vida.
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),

  -- ----------------------------------------------------------------
  -- Constraints
  -- ----------------------------------------------------------------
  CONSTRAINT twc_provider_chk     CHECK (provider IN ('meta')),
  CONSTRAINT twc_webhook_secret_uq UNIQUE (webhook_secret)
);

-- -----------------------------------------------------------------------
-- Comentários de documentação
-- -----------------------------------------------------------------------
COMMENT ON TABLE tenant_whatsapp_canais IS
  'Multi-número Meta (WhatsApp Business) por tenant (migration 081). '
  'Cada linha = um canal/número dedicado, com credenciais cifradas e '
  'webhook_secret único global. NÃO substitui tenant_whatsapp_config '
  '(052 — config única Z-API/Evolution). RLS padrão por tenant_id.';

COMMENT ON COLUMN tenant_whatsapp_canais.label IS
  'Rótulo exibido no painel e nos logs. Ex.: ''Geral'', ''Saúde'', ''Ouvidoria''.';

COMMENT ON COLUMN tenant_whatsapp_canais.provider IS
  'Provider do canal. Somente ''meta'' nesta tabela (CHECK). '
  'Ampliar via migration separada se outros providers multi-número forem suportados.';

COMMENT ON COLUMN tenant_whatsapp_canais.meta_phone_number_id IS
  'ID do número de telefone na Graph API Meta (endpoint /{id}/messages).';

COMMENT ON COLUMN tenant_whatsapp_canais.meta_waba_id IS
  'WhatsApp Business Account ID. Opcional; necessário em cenários multi-WABA.';

COMMENT ON COLUMN tenant_whatsapp_canais.meta_token_cifrado IS
  'Access token permanente do System User Meta — cifrado com AES-256-GCM '
  '(secret-box.util). Nunca logar nem retornar sem máscara na API.';

COMMENT ON COLUMN tenant_whatsapp_canais.meta_app_secret_cifrado IS
  'App Secret cifrado. Usado para validar a assinatura HMAC-SHA256 '
  '(header X-Hub-Signature-256) nos webhooks de entrada da Meta.';

COMMENT ON COLUMN tenant_whatsapp_canais.meta_verify_token IS
  'Token do handshake de verificação do webhook (GET hub.verify_token). '
  'Definido pelo administrador no painel Meta for Developers.';

COMMENT ON COLUMN tenant_whatsapp_canais.webhook_secret IS
  'Segredo aleatório (mínimo 32 bytes hex) no path do webhook: '
  'POST /webhooks/meta/c/:webhook_secret. '
  'UNIQUE GLOBAL — resolve canal e tenant ANTES de validar a assinatura. '
  'Busca cross-tenant feita com prisma.platform() (sem TenantContext).';

COMMENT ON COLUMN tenant_whatsapp_canais.secretaria_id IS
  'Secretaria responsável pelo canal (opcional). '
  'ON DELETE SET NULL: canal volta a ser ''geral'' se a secretaria for removida.';

COMMENT ON COLUMN tenant_whatsapp_canais.ativo IS
  'Falso desabilita o canal sem excluir as credenciais. '
  'Webhooks recebidos em canais inativos são rejeitados (HTTP 409) pela API.';

COMMENT ON COLUMN tenant_whatsapp_canais.ordem IS
  'Ordem de exibição no seletor de canal do painel admin (menor = primeiro).';

COMMENT ON COLUMN tenant_whatsapp_canais.atualizado_em IS
  'Atualizado automaticamente pelo trigger trg_twc_atualizado_em.';

-- -----------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------
-- Filtragem por tenant + status no painel e nas listagens da API.
CREATE INDEX IF NOT EXISTS idx_twc_tenant_ativo
  ON tenant_whatsapp_canais(tenant_id, ativo);

-- Lookup cross-tenant no webhook (busca por webhook_secret antes do
-- TenantContext). O UNIQUE acima já cria o índice; este bloco garante
-- idempotência e documenta o propósito explicitamente.
-- (Postgres cria automaticamente um índice único para a UNIQUE constraint;
--  não duplicamos — apenas documentamos.)

-- -----------------------------------------------------------------------
-- RLS — isolamento por tenant
-- -----------------------------------------------------------------------
-- app_enable_tenant_rls cria:
--   ALTER TABLE … ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE … FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON …
--     USING (app_is_platform() OR tenant_id = app_current_tenant())
--     WITH CHECK (app_is_platform() OR tenant_id = app_current_tenant());
--
-- O super_admin (role de banco com BYPASSRLS) enxerga todas as linhas
-- sem policy. O lookup de webhook cross-tenant usa prisma.platform()
-- (app_is_platform() = true), coberto pela policy acima.
-- -----------------------------------------------------------------------
SELECT app_enable_tenant_rls('tenant_whatsapp_canais');

-- -----------------------------------------------------------------------
-- TRIGGER: manter atualizado_em sincronizado em UPDATE
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_twc_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_twc_atualizado_em ON tenant_whatsapp_canais;
CREATE TRIGGER tg_twc_atualizado_em
  BEFORE UPDATE ON tenant_whatsapp_canais
  FOR EACH ROW EXECUTE FUNCTION trg_twc_atualizado_em();

-- -----------------------------------------------------------------------
-- GRANTs
-- -----------------------------------------------------------------------
-- portal_app (role da API NestJS): CRUD completo — a policy RLS restringe
--   o que cada sessão pode ver/alterar; o GRANT concede o direito técnico.
-- portal_ro  (role de leitura — BI, replicas): SELECT apenas.
-- O bloco DO usa IF EXISTS para não falhar em ambientes de CI onde os
-- roles ainda não foram criados.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_whatsapp_canais TO portal_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    EXECUTE 'GRANT SELECT ON tenant_whatsapp_canais TO portal_ro';
  END IF;
END;
$$;

-- =====================================================================
-- Alteração em atendimento_conversas
-- =====================================================================
-- Vincula cada conversa de atendimento ao canal Meta que a originou.
-- Quando preenchido, a API de saída roteia a resposta pelo mesmo número
-- (sem misturar canais distintos no mesmo thread do cidadão).
-- ON DELETE SET NULL: se o canal for excluído, a conversa permanece
-- acessível e histórica; o campo fica NULL (sem roteamento por canal).
-- =====================================================================

ALTER TABLE atendimento_conversas
  ADD COLUMN IF NOT EXISTS canal_id uuid
    REFERENCES tenant_whatsapp_canais(id) ON DELETE SET NULL;

COMMENT ON COLUMN atendimento_conversas.canal_id IS
  'FK para tenant_whatsapp_canais — canal Meta que originou a conversa. '
  'Quando preenchido, a resposta de saída é roteada pelo mesmo número '
  '(evita mistura de canais no thread). NULL = canal não identificado '
  'ou conversa aberta fora do WhatsApp Multi-número (web/Z-API/Evolution).';

-- Índice composto: filtragem por tenant + canal no painel de atendimento
-- e nas queries de roteamento (ex.: "conversas ativas do canal Saúde").
CREATE INDEX IF NOT EXISTS idx_atconv_tenant_canal
  ON atendimento_conversas(tenant_id, canal_id)
  WHERE canal_id IS NOT NULL;

-- =====================================================================
-- TESTES DE ISOLAMENTO RLS (executar manualmente em dev/staging)
-- =====================================================================
-- Pré-requisito: dois tenants criados, roles portal_app / portal_ro
-- existindo, dois usuários de BD com SET ROLE portal_app.
--
-- TESTE 1 — Inserção e isolamento de leitura:
--
--   BEGIN;
--   SET LOCAL app.current_tenant_id = '<uuid-tenant-A>';
--   INSERT INTO tenant_whatsapp_canais
--     (tenant_id, label, webhook_secret)
--   VALUES ('<uuid-tenant-A>', 'Geral', 'secret-A-001');
--
--   SET LOCAL app.current_tenant_id = '<uuid-tenant-B>';
--   INSERT INTO tenant_whatsapp_canais
--     (tenant_id, label, webhook_secret)
--   VALUES ('<uuid-tenant-B>', 'Geral', 'secret-B-001');
--
--   -- Deve retornar 0 linhas (B não vê o canal do A):
--   SET LOCAL app.current_tenant_id = '<uuid-tenant-B>';
--   SELECT count(*) FROM tenant_whatsapp_canais
--    WHERE label = 'Geral' AND tenant_id = '<uuid-tenant-A>';
--   -- Esperado: 0
--   ROLLBACK;
--
-- TESTE 2 — Lookup cross-tenant (webhook):
--   (Fora de TenantContext, via prisma.platform())
--   SELECT id, tenant_id FROM tenant_whatsapp_canais
--    WHERE webhook_secret = 'secret-A-001';
--   -- Esperado: 1 linha (tenant A)
--
-- TESTE 3 — Trigger atualizado_em:
--   UPDATE tenant_whatsapp_canais SET label = 'Geral v2'
--    WHERE webhook_secret = 'secret-A-001';
--   SELECT atualizado_em FROM tenant_whatsapp_canais
--    WHERE webhook_secret = 'secret-A-001';
--   -- Esperado: atualizado_em = now() (diferente de criado_em)
-- =====================================================================
