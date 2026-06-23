-- =====================================================================
-- 082 — Consumo de templates/créditos + Instagram Direct (canais)
-- =====================================================================
-- Fecha dois itens de editais de atendimento (ex.: Aripuanã/MT):
--  (a) Relatório de consumo de mensagens automatizadas (templates) + cota +
--      alerta de esgotamento de créditos (item 80868).
--  (b) Instagram Direct como tipo de canal, ao lado do WhatsApp (multi-canal
--      da migration 081), reaproveitando as credenciais Meta.
-- =====================================================================

-- (b) Tipo do canal: 'whatsapp' (default) ou 'instagram'.
-- Para canais Instagram, meta_phone_number_id guarda o ID da conta IG/Página,
-- e meta_token guarda o Page Access Token.
ALTER TABLE tenant_whatsapp_canais
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'whatsapp';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'twc_tipo_chk'
  ) THEN
    ALTER TABLE tenant_whatsapp_canais
      ADD CONSTRAINT twc_tipo_chk CHECK (tipo IN ('whatsapp', 'instagram'));
  END IF;
END $$;

COMMENT ON COLUMN tenant_whatsapp_canais.tipo IS 'Tipo do canal: whatsapp | instagram. IG usa meta_phone_number_id como ID da conta/página e meta_token como Page Access Token.';

-- (a) Cota de créditos de templates por tenant.
CREATE TABLE IF NOT EXISTS tenant_whatsapp_cota (
  tenant_id          uuid        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  creditos_total     int         NOT NULL DEFAULT 0,     -- 0 = sem cota definida (ilimitado/indefinido)
  alerta_percentual  int         NOT NULL DEFAULT 80,    -- alerta ao atingir este % do total
  ciclo_dia          int         NOT NULL DEFAULT 1,     -- dia do mês que reinicia o ciclo de cobrança
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT twcota_pct_chk   CHECK (alerta_percentual BETWEEN 1 AND 100),
  CONSTRAINT twcota_ciclo_chk CHECK (ciclo_dia BETWEEN 1 AND 28)
);
COMMENT ON TABLE tenant_whatsapp_cota IS 'Cota de créditos de templates (mensagens automatizadas Meta) por tenant + % de alerta de esgotamento.';

SELECT app_enable_tenant_rls('tenant_whatsapp_cota');

-- (a) Log de cada envio de template — base do relatório de consumo.
-- LGPD: número mascarado (•••• + 4 dígitos), sem conteúdo da mensagem.
CREATE TABLE IF NOT EXISTS whatsapp_template_envios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canal_id       uuid        REFERENCES tenant_whatsapp_canais(id) ON DELETE SET NULL,
  template_nome  text,
  to_mascarado   text,
  status         text        NOT NULL DEFAULT 'enviado',  -- enviado | falhou
  criado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE whatsapp_template_envios IS 'Um registro por envio de template (consumo). Número mascarado (LGPD), sem conteúdo.';

CREATE INDEX IF NOT EXISTS idx_wte_tenant_data ON whatsapp_template_envios (tenant_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_wte_tenant_canal ON whatsapp_template_envios (tenant_id, canal_id);

SELECT app_enable_tenant_rls('whatsapp_template_envios');

-- (b) Permitir canal='instagram' nas conversas (a CHECK original só tinha widget|whatsapp).
ALTER TABLE atendimento_conversas DROP CONSTRAINT IF EXISTS atendimento_conversas_canal_check;
ALTER TABLE atendimento_conversas
  ADD CONSTRAINT atendimento_conversas_canal_check
  CHECK (canal IN ('widget', 'whatsapp', 'instagram'));
