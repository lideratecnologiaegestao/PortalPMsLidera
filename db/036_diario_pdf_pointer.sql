-- =====================================================================
-- 036 — Diário: permitir gravar o ponteiro do PDF em edição publicada
-- =====================================================================
-- O PDF da edição é GERADO de forma assíncrona DEPOIS da publicação (fila).
-- Gravar `arquivo_key`/`total_paginas` é só registrar onde está o arquivo —
-- NÃO altera o conteúdo legal (numero/data/título/conteúdo/matérias/hash/
-- assinatura), que permanece imutável. Refinamos o trigger para liberar
-- exclusivamente esses dois campos quando a edição já está publicada; qualquer
-- outra alteração continua bloqueada (comportamento idêntico ao anterior).
-- =====================================================================

CREATE OR REPLACE FUNCTION diario_bloqueia_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'publicado' THEN
    -- Libera apenas a gravação do ponteiro do PDF (status continua 'publicado'
    -- e nenhum campo de conteúdo/autenticidade muda).
    IF NEW.status = 'publicado'
       AND NEW.numero        IS NOT DISTINCT FROM OLD.numero
       AND NEW.data_edicao   IS NOT DISTINCT FROM OLD.data_edicao
       AND NEW.titulo        IS NOT DISTINCT FROM OLD.titulo
       AND NEW.conteudo      IS NOT DISTINCT FROM OLD.conteudo
       AND NEW.hash          IS NOT DISTINCT FROM OLD.hash
       AND NEW.assinatura    IS NOT DISTINCT FROM OLD.assinatura
       AND NEW.algoritmo     IS NOT DISTINCT FROM OLD.algoritmo
       AND NEW.carimbo_tempo IS NOT DISTINCT FROM OLD.carimbo_tempo
       AND NEW.numero_seq    IS NOT DISTINCT FROM OLD.numero_seq
       AND NEW.tipo_edicao   IS NOT DISTINCT FROM OLD.tipo_edicao
       AND NEW.publicado_em  IS NOT DISTINCT FROM OLD.publicado_em
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Edição publicada do Diário Oficial é imutável (não pode ser alterada).';
  END IF;
  RETURN NEW;
END;
$$;
