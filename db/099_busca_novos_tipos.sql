-- =====================================================================
-- 099 — Buscador: novos tipos indexáveis no search_index
-- =====================================================================
-- Amplia o CHECK de `search_index.tipo` para incluir o conteúdo institucional
-- novo: prefeito (titular/vice/ex/primeira-dama), historia, hino_brasao e
-- politica (acessibilidade/privacidade/cookies). Eventos e unidades continuam
-- indexados DENTRO da secretaria (mesmo tipo 'secretaria').
-- =====================================================================

ALTER TABLE search_index DROP CONSTRAINT IF EXISTS ck_search_tipo;
ALTER TABLE search_index
  ADD CONSTRAINT ck_search_tipo CHECK (tipo IN (
    'noticia', 'documento', 'diario', 'servico', 'secretaria',
    'cms', 'transparencia', 'licitacao', 'contrato',
    'convenio', 'conselho', 'concurso',
    'prefeito', 'historia', 'hino_brasao', 'politica'
  ));
