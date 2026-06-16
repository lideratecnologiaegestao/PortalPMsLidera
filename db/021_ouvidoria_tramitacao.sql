-- =====================================================================
-- 021 — Ouvidoria/e-SIC: chat de tramitação, chave de acompanhamento e
--       pesquisa de satisfação. Estende o módulo de manifestações (004).
-- =====================================================================
-- A FSM e o SLA já existem na aplicação. Aqui adicionamos:
--  - chave_hash: chave de acompanhamento do cidadão (hash) para consulta
--    anônima/pública por protocolo sem expor o conteúdo a quem adivinhe o nº.
--  - manifestacao_mensagens: thread de tramitação (cidadão ↔ ouvidor ↔ área).
--    `interno=true` = tramitação interna (ouvidor↔área), NÃO visível ao cidadão.
--  - pesquisa_satisfacao: avaliação pós-conclusão (Lei 13.460).
-- Tudo com RLS por tenant.
-- =====================================================================

-- Chave de acompanhamento (armazenada como hash; o texto é mostrado uma vez).
ALTER TABLE manifestacoes ADD COLUMN IF NOT EXISTS chave_hash text;

-- Thread de tramitação em chat.
CREATE TABLE IF NOT EXISTS manifestacao_mensagens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
  autor_tipo      text NOT NULL,                 -- cidadao | servidor | sistema
  autor_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  autor_nome      text,                          -- rótulo de exibição (ex.: "Ouvidoria")
  conteudo        text NOT NULL,
  interno         boolean NOT NULL DEFAULT false, -- true: ouvidor↔área (oculto ao cidadão)
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manif_msg ON manifestacao_mensagens (manifestacao_id, criado_em);
SELECT app_enable_tenant_rls('manifestacao_mensagens');

-- Pesquisa de satisfação (uma por manifestação).
CREATE TABLE IF NOT EXISTS pesquisa_satisfacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
  nota            int  NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manifestacao_id)
);
SELECT app_enable_tenant_rls('pesquisa_satisfacao');
