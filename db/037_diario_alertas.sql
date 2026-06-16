-- =====================================================================
-- 037 — Diário: monitoramento por termo (alertas ao cidadão)
-- =====================================================================
-- O cidadão/advogado cadastra um TERMO (ex.: o próprio nome) e recebe alerta
-- por e-mail ou WhatsApp quando ele aparece numa nova edição publicada.
--
-- LGPD: base legal = CONSENTIMENTO. Minimização (só termo + 1 contato). Double
-- opt-in (status 'pendente' até confirmar pelo token enviado ao contato) prova
-- o consentimento e evita cadastrar terceiros. Descadastro a 1 clique (token).
-- =====================================================================

CREATE TABLE diario_alertas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  termo           text NOT NULL,
  canal           text NOT NULL,                       -- email | whatsapp
  destino         text NOT NULL,                       -- e-mail ou telefone
  status          text NOT NULL DEFAULT 'pendente',    -- pendente | ativo | cancelado
  token           text NOT NULL,                       -- confirmação + descadastro
  confirmado_em   timestamptz,
  cancelado_em    timestamptz,
  ultimo_envio_em timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerta_status ON diario_alertas (tenant_id, status);
CREATE UNIQUE INDEX uq_alerta_token ON diario_alertas (token);
-- evita duplicar o mesmo termo+contato ativo/pendente para o mesmo tenant
CREATE UNIQUE INDEX uq_alerta_dedupe
  ON diario_alertas (tenant_id, canal, destino, lower(termo))
  WHERE status <> 'cancelado';

SELECT app_enable_tenant_rls('diario_alertas');
