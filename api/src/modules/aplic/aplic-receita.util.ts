import { parseValorAplic } from './aplic-datapacket.parser';

/**
 * Extrai a RECEITA ARRECADADA do LANCAMENTO_CONTABIL_DIARIO da carga CT, sem
 * fazer parse XML completo (o arquivo chega a dezenas de MB). Faz uma varredura
 * por regex apenas nas linhas das contas de controle da receita do PCASP/TCE:
 *   6.2.1.2  RECEITA REALIZADA  → arrecadação (créditos − débitos)
 *   6.2.1.3  (-) DEDUÇÕES       → informativo
 * A natureza vem do 1º segmento da CONTA-CORRENTE; o nome, do histórico.
 */

export interface ReceitaNatureza {
  codigo: string;
  nome: string | null;
  arrecadado: number;
  deducao: number;
}

const RE_ROW = /<ROW\b([^>]*?)\/>/g;
const ATTR = (s: string, n: string): string => {
  const m = s.match(new RegExp(`${n}="([^"]*)"`));
  return m ? m[1] : '';
};

/** Nome da natureza a partir do histórico ("…ARRECADAÇÃO DE <cod> <NOME>"). */
function nomeDoHistorico(hist: string): string | null {
  if (!hist) return null;
  // remove o prefixo "…DE <codigo pontuado> " e fica com o nome.
  const m = hist.match(/\bDE\s+[\d.]+\s+(.+)$/i);
  const nome = (m ? m[1] : hist).trim();
  return nome ? nome.slice(0, 200) : null;
}

/**
 * Recebe o XML do LANCAMENTO em string (latin1) e devolve a arrecadação por
 * natureza. `prefixoRealizada`/`prefixoDeducao` são os códigos de conta (ECTCE)
 * de receita realizada e deduções (default 6.2.1.2 / 6.2.1.3 do elenco TCE-MT).
 */
export function extrairReceitaArrecadada(
  xml: string,
  prefixoRealizada = '6212',
  prefixoDeducao = '6213',
): ReceitaNatureza[] {
  const acc = new Map<string, ReceitaNatureza>();
  let m: RegExpExecArray | null;
  RE_ROW.lastIndex = 0;
  while ((m = RE_ROW.exec(xml))) {
    const row = m[1];
    const conta = ATTR(row, 'ECTCE_Codigo');
    const realizada = conta.startsWith(prefixoRealizada);
    const deducao = !realizada && conta.startsWith(prefixoDeducao);
    if (!realizada && !deducao) continue;

    const cc = ATTR(row, 'LCDTCE_ContaCorrente');
    const natureza = (cc.split('|')[0] || '').trim();
    if (!natureza) continue;

    const credito = parseValorAplic(ATTR(row, 'LCDTCE_ValorCredito'));
    const debito = parseValorAplic(ATTR(row, 'LCDTCE_ValorDebito'));
    const valor = credito - debito; // contas de saldo credor: líquido do movimento

    const cur = acc.get(natureza) ?? { codigo: natureza, nome: null, arrecadado: 0, deducao: 0 };
    if (realizada) cur.arrecadado += valor;
    else cur.deducao += valor;
    if (!cur.nome) cur.nome = nomeDoHistorico(ATTR(row, 'LCDTCE_Historico'));
    acc.set(natureza, cur);
  }
  // arredonda p/ 2 casas
  return [...acc.values()].map((r) => ({
    ...r,
    arrecadado: Math.round(r.arrecadado * 100) / 100,
    deducao: Math.round(r.deducao * 100) / 100,
  }));
}
