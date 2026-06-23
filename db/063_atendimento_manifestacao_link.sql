-- =====================================================================
-- 063 — Cross-link conversa de atendimento ↔ manifestação de ouvidoria
-- =====================================================================
-- Quando o bot do chat abre uma manifestação (denúncia/reclamação/...) em nome
-- do cidadão, guardamos o vínculo na conversa para o ouvidor saltar do chat para
-- a manifestação no painel. `manifestacao_protocolo` é denormalizado só para
-- exibir o número sem JOIN. FK SET NULL preserva a conversa se a manifestação
-- for removida. Tabela já tem RLS (migration 050); colunas herdam a policy.
-- =====================================================================

ALTER TABLE atendimento_conversas
  ADD COLUMN IF NOT EXISTS manifestacao_id        uuid REFERENCES manifestacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manifestacao_protocolo text;

COMMENT ON COLUMN atendimento_conversas.manifestacao_id IS 'Manifestação aberta a partir desta conversa (bot/atendente). NULL = nenhuma.';
COMMENT ON COLUMN atendimento_conversas.manifestacao_protocolo IS 'Protocolo da manifestação vinculada (denormalizado para exibição no painel).';
