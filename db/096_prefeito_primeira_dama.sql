-- =====================================================================
-- 096 — Prefeito: aceita o tipo 'primeira_dama'
-- =====================================================================
-- A chefia do Executivo (titular, vice e primeira-dama) passa a ser cadastrada
-- toda no módulo Prefeito. O Gabinete (na Estrutura) fica só com o Chefe de
-- Gabinete. Aqui ampliamos o CHECK de `tipo` para incluir 'primeira_dama'
-- (o gênero define o rótulo: Primeira-dama / Primeiro-cavalheiro).
-- =====================================================================

ALTER TABLE prefeitos DROP CONSTRAINT IF EXISTS chk_prefeito_tipo;
ALTER TABLE prefeitos
  ADD CONSTRAINT chk_prefeito_tipo CHECK (tipo IN ('prefeito','vice','primeira_dama'));
