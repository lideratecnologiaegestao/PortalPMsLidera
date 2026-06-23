-- 075_comentario_moderacao_ia.sql
-- Moderação automática (determinística + IA) dos comentários de notícias.
-- Registra a decisão automática para transparência no painel do moderador.
-- LGPD: motivo/categoria são metadados de moderação, sem dado pessoal novo.
-- Aplicar como superusuário postgres.

ALTER TABLE noticia_comentarios
  ADD COLUMN IF NOT EXISTS moderado_por_ia   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderacao_motivo  text,
  ADD COLUMN IF NOT EXISTS moderacao_categoria text;

COMMENT ON COLUMN noticia_comentarios.moderado_por_ia IS 'true = status definido automaticamente pelo moderador (regra/IA), não por humano';
COMMENT ON COLUMN noticia_comentarios.moderacao_motivo IS 'Justificativa da decisão automática (ex.: linguagem ofensiva, tentativa de código)';
COMMENT ON COLUMN noticia_comentarios.moderacao_categoria IS 'ofensivo | baixo_calao | sem_nexo | spam | codigo_malicioso | ok';

-- Verificação:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='noticia_comentarios' AND column_name LIKE 'moderacao%' OR column_name='moderado_por_ia';
