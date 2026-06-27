/**
 * Nomenclatura padrão do TCE-MT para o nome do arquivo da carga APLIC.
 * Convenção: {UG:7}{TIPO}{EXERCICIO:4}[{MES:2}][_{CARIMBO}].ZIP
 *   - TIPO por LETRAS (mensal/tempestiva): CT (Contabilidade), CC (Contratos/
 *     Convênios), FP (Folha), PA (Patrimônio/Administrativo), PL (Processo
 *     Licitatório), CP (Concurso) + ano(4) + competência(2).
 *   - TIPO por CÓDIGO numérico (anual, sem competência): 00 (Orçamento),
 *     13 (Encerramento 13º), 99 (Encerramento do exercício) + ano(4).
 * Ex.: 1112796CT202501.ZIP / 1112796002025.ZIP
 *
 * Validar o nome ANTES de processar evita importar carga de outra entidade, de
 * módulo desconhecido, ou um .zip qualquer fora do padrão do TCE.
 */

export interface MetaCargaTce {
  ug: string;
  modulo: string;
  exercicio: number;
  competencia: string | null;
}

const MODULOS_MENSAIS = ['CT', 'CC', 'FP', 'PA', 'PL', 'CP'] as const;
const COD_ANUAL: Record<string, string> = {
  '00': 'ORCAMENTO',
  '13': 'ENCERRAMENTO',
  '99': 'CARGA_INICIAL',
};

const RE_MENSAL = /^(\d{7})(CT|CC|FP|PA|PL|CP)(\d{4})(0[1-9]|1[0-2])(?:_[A-Za-z0-9]+)?$/i;
const RE_ANUAL = /^(\d{7})(00|13|99)(\d{4})(?:_[A-Za-z0-9]+)?$/;

/** Extrai só o nome-base do arquivo (sem caminho nem extensão .zip). */
export function baseNomeCarga(arquivoNome: string | undefined | null): string {
  return (arquivoNome ?? '').split(/[\\/]/).pop()?.replace(/\.zip$/i, '') ?? '';
}

/**
 * Faz o parse do nome conforme a nomenclatura do TCE. Retorna a meta da carga
 * ou `null` se o nome NÃO segue o padrão.
 */
export function parseNomeCargaTce(arquivoNome: string | undefined | null): MetaCargaTce | null {
  const base = baseNomeCarga(arquivoNome);

  const m = base.match(RE_MENSAL);
  if (m) {
    return { ug: m[1], modulo: m[2].toUpperCase(), exercicio: Number(m[3]), competencia: m[4] };
  }
  const a = base.match(RE_ANUAL);
  if (a) {
    return { ug: a[1], modulo: COD_ANUAL[a[2]] ?? `COD_${a[2]}`, exercicio: Number(a[3]), competencia: null };
  }
  return null;
}

/**
 * Valida o nome e devolve a meta, ou lança erro com mensagem orientativa.
 * Não confunda com a checagem de UG da entidade (feita à parte).
 */
export function exigirNomeCargaTce(arquivoNome: string | undefined | null): MetaCargaTce {
  const meta = parseNomeCargaTce(arquivoNome);
  if (!meta) {
    const base = baseNomeCarga(arquivoNome) || '(vazio)';
    throw new Error(
      `O arquivo "${base}.ZIP" não segue a nomenclatura padrão do TCE-MT ` +
        `({UG de 7 dígitos}{módulo}{ano}{competência}.ZIP, ex.: 1112796CT202501.ZIP). ` +
        `Módulos aceitos: ${MODULOS_MENSAIS.join('/')} (mensais) e 00/13/99 (anuais). ` +
        `Renomeie o arquivo exatamente como o TCE gera e tente novamente.`,
    );
  }
  return meta;
}
