-- =====================================================================
-- 100 — Documentos legais: adiciona "Termos de Uso"
-- =====================================================================
-- Amplia o CHECK de `documentos_legais.tipo` para incluir 'termos'
-- (Termos de Uso), junto de acessibilidade, privacidade e cookies.
-- =====================================================================

ALTER TABLE documentos_legais DROP CONSTRAINT IF EXISTS chk_doc_legal_tipo;
ALTER TABLE documentos_legais
  ADD CONSTRAINT chk_doc_legal_tipo CHECK (tipo IN ('acessibilidade','privacidade','cookies','termos'));
