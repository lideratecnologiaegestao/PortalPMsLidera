-- =====================================================================
-- 105 — Certificado Digital (ICP-Brasil A1) por tenant + assinatura
-- =====================================================================
-- Cofre por tenant para o certificado digital A1 (.pfx/.p12 ICP-Brasil) usado
-- para ASSINAR os PDFs institucionais (Diário Oficial, certificados de curso).
--
-- Segurança: o binário do .pfx (base64) e a SENHA ficam CIFRADOS em repouso
-- (AES-256-GCM via common/crypto/secret-box — chave de SECRET_BOX_KEY se definida,
-- senão AUTH_JWT_SECRET; ambas vivem só no ambiente). Um vazamento do banco não
-- revela a chave privada. ⚠️ Rotacionar a chave de cifra exige RE-IMPORTAR o .pfx:
-- a decifragem tenta as chaves conhecidas, então mantenha a chave antiga numa das
-- variáveis durante a migração e re-grave os segredos.
-- Os metadados (titular, emissor, validade) ficam em claro só para exibição.
-- A API NUNCA retorna o .pfx nem a senha.
--
-- Também acrescenta colunas de assinatura em `curso_certificados` (espelham o
-- Diário: hash + assinatura + algoritmo + carimbo_tempo) para dar validade
-- criptográfica ao certificado de curso (hoje só há QR informativo).
-- Tenant-scoped + RLS. Ver api/src/modules/certificado-digital/.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenant_certificado_config (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  pfx_cifrado    text        NOT NULL,               -- .pfx (base64) cifrado (AES-256-GCM)
  senha_cifrada  text        NOT NULL,               -- senha do .pfx cifrada
  titular        text,                               -- CN do subject (ex.: e-CNPJ)
  emissor        text,                               -- CN do issuer (AC)
  numero_serie   text,                               -- serial do certificado
  tipo           text,                               -- e-CNPJ A1 | e-CPF A1 | outro
  valido_de      timestamptz,                        -- notBefore
  valido_ate     timestamptz,                        -- notAfter
  ativo          boolean     NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('tenant_certificado_config');

-- ---- GRANT ao role da aplicação (tabela nova; idempotente) ---------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_certificado_config TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    GRANT SELECT ON tenant_certificado_config TO portal_ro;
  END IF;
END$$;

-- ---- Colunas de assinatura no certificado de curso -----------------------
-- `assinatura_serie` = nº de série do certificado que assinou; permite reverificar
-- corretamente após a renovação anual do A1 (não marcar como adulterado à toa).
ALTER TABLE curso_certificados
  ADD COLUMN IF NOT EXISTS hash             text,
  ADD COLUMN IF NOT EXISTS assinatura       text,
  ADD COLUMN IF NOT EXISTS algoritmo        text,
  ADD COLUMN IF NOT EXISTS carimbo_tempo    timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_serie text;

-- Mesma série no Diário Oficial (reverificação após renovação do certificado).
ALTER TABLE diario_edicoes
  ADD COLUMN IF NOT EXISTS assinatura_serie text;
