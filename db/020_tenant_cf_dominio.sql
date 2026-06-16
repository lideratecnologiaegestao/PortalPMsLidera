-- =====================================================================
-- 020 — Estado do domínio próprio (Cloudflare Custom Hostname) no tenant
-- =====================================================================
-- Guarda o id do Custom Hostname, o status de validação e um snapshot dos
-- registros de validação (TXT/HTTP) para o Gerenciador exibir ao cliente.
-- `tenants` é a tabela-registro (sem RLS por tenant); acesso só em modo
-- plataforma (super_admin).
-- =====================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cf_custom_hostname_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cf_status             text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cf_validacao          jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cf_atualizado_em      timestamptz;
