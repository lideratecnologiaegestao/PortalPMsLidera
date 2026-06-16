-- =====================================================================
-- 044 — Avaliação por estrelas dos serviços (Carta de Serviços, Lei 13.460)
-- =====================================================================
-- Avaliação anônima (1–5 estrelas), 1 voto por visitante (hash IP+UA+segredo,
-- sem guardar dado pessoal). Soma/qtd denormalizadas em `servicos` para média e
-- ranking "mais avaliados" rápidos.
-- =====================================================================

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS avaliacao_soma integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avaliacao_qtd  integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS servico_avaliacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  servico_id   uuid NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  nota         smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario   text,
  votante_hash text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (servico_id, votante_hash)
);
CREATE INDEX IF NOT EXISTS idx_avaliacao_servico ON servico_avaliacoes (tenant_id, servico_id);
SELECT app_enable_tenant_rls('servico_avaliacoes');
