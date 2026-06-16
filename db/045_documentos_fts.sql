-- =====================================================================
-- 045 — Indexação full-text do CONTEÚDO dos documentos (SIC)
-- =====================================================================
-- Além dos metadados (título/ementa/número), passamos a indexar o TEXTO
-- extraído do arquivo (PDF/DOCX) por um worker assíncrono. `conteudo_extraido`
-- é preenchido pela fila; `busca_conteudo` é o tsvector (português) gerado a
-- partir dele, com índice GIN para busca full-text.
-- =====================================================================

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS conteudo_extraido text,
  ADD COLUMN IF NOT EXISTS conteudo_indexado_em timestamptz,
  ADD COLUMN IF NOT EXISTS busca_conteudo tsvector
    GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(conteudo_extraido, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_documento_busca_conteudo ON documentos USING gin (busca_conteudo);
