import { parseValorAplic, parseDataAplic } from './aplic-datapacket.parser';

/**
 * Extrai do LANCAMENTO_CONTABIL_DIARIO os movimentos necessários para responder,
 * com PRECISÃO, perguntas do cidadão sobre saldos e arrecadação por FONTE DE
 * RECURSO (destinação de recurso = DRGRP.DRESP.DESTREC do PCASP/TCE):
 *   - 'receita' : conta 6.2.1.2 (RECEITA REALIZADA)  → arrecadação (crédito)
 *   - 'ddr'     : conta 8.2.1.1 (Disponibilidade por Destinação de Recursos) → saldo por fonte
 *   - 'caixa'   : conta 1.1.1.x (Caixa e Equivalentes de Caixa)             → saldo de caixa
 * A FONTE vem da CONTA-CORRENTE; a posição dos segmentos depende do tipo da
 * conta-corrente (nº de segmentos), tratado por grupo. Sem parse XML completo
 * (o arquivo tem dezenas de MB): varredura por regex. Agrega por
 * (grupo, conta, data, natureza, fonte) para reduzir volume mantendo a data.
 */

export type GrupoContabil = 'receita' | 'ddr' | 'caixa';

export interface MovContabil {
  grupo: GrupoContabil;
  conta: string;
  data: Date | null;
  natureza: string | null; // só 'receita'
  drgrp: string | null;
  dresp: string | null;
  destrec: string | null;
  debito: number;
  credito: number;
}

const RE_ROW = /<ROW\b([^>]*?)\/>/g;
const attr = (s: string, n: string): string => {
  const m = s.match(new RegExp(`${n}="([^"]*)"`));
  return m ? m[1] : '';
};

/** Classifica a conta no grupo de interesse (ou null). */
function grupoDaConta(conta: string): GrupoContabil | null {
  if (conta.startsWith('6212')) return 'receita';
  if (conta.startsWith('8211')) return 'ddr';
  if (conta.startsWith('111')) return 'caixa';
  return null;
}

/**
 * Extrai a fonte (DRGRP/DRESP/DESTREC) e a natureza da conta-corrente conforme
 * o grupo. As posições seguem o formato da conta-corrente do TCE-MT:
 *   receita (cc78, 5 seg): ESPRC | DRGRP | DRESP | DESTREC | BIMESTRE
 *   ddr     (cc68, 3 seg): DRGRP | DRESP | DESTREC
 *   caixa   (cc76, 5 seg): DRGRP | DRESP | DESTREC | TMOVF | CG
 *           (cc80, 9 seg): BCO | AGN | CC | TIPO | DRGRP | DRESP | DESTREC | TMOVF | CG
 */
function fonteDaContaCorrente(grupo: GrupoContabil, cc: string) {
  const seg = cc.split('|').map((s) => s.trim());
  const vazio = { natureza: null as string | null, drgrp: null as string | null, dresp: null as string | null, destrec: null as string | null };
  if (grupo === 'receita') {
    if (seg.length < 4) return vazio;
    return { natureza: seg[0] || null, drgrp: seg[1] || null, dresp: seg[2] || null, destrec: seg[3] || null };
  }
  if (grupo === 'ddr') {
    if (seg.length < 3) return vazio;
    return { natureza: null, drgrp: seg[0] || null, dresp: seg[1] || null, destrec: seg[2] || null };
  }
  // caixa: 9 segmentos = conta bancária (cc80); senão cc76 (3 primeiros = fonte)
  const b = seg.length >= 9 ? 4 : 0;
  if (seg.length < b + 3) return vazio;
  return { natureza: null, drgrp: seg[b] || null, dresp: seg[b + 1] || null, destrec: seg[b + 2] || null };
}

/** Chave de agregação por dia/conta/fonte/natureza. */
function chave(m: { grupo: string; conta: string; dataIso: string; natureza: string | null; drgrp: string | null; dresp: string | null; destrec: string | null }) {
  return [m.grupo, m.conta, m.dataIso, m.natureza ?? '', m.drgrp ?? '', m.dresp ?? '', m.destrec ?? ''].join('|');
}

/** Varre o XML e devolve os movimentos agregados de caixa/DDR/receita. */
export function extrairMovContabil(xml: string): MovContabil[] {
  const acc = new Map<string, MovContabil>();
  let m: RegExpExecArray | null;
  RE_ROW.lastIndex = 0;
  while ((m = RE_ROW.exec(xml))) {
    const row = m[1];
    const conta = attr(row, 'ECTCE_Codigo');
    const grupo = grupoDaConta(conta);
    if (!grupo) continue;

    const data = parseDataAplic(attr(row, 'MCC_Data'));
    const f = fonteDaContaCorrente(grupo, attr(row, 'LCDTCE_ContaCorrente'));
    const dataIso = data ? data.toISOString().slice(0, 10) : '';
    const k = chave({ grupo, conta, dataIso, ...f });
    const cur = acc.get(k) ?? { grupo, conta, data, natureza: f.natureza, drgrp: f.drgrp, dresp: f.dresp, destrec: f.destrec, debito: 0, credito: 0 };
    cur.debito += parseValorAplic(attr(row, 'LCDTCE_ValorDebito'));
    cur.credito += parseValorAplic(attr(row, 'LCDTCE_ValorCredito'));
    acc.set(k, cur);
  }
  return [...acc.values()].map((r) => ({
    ...r,
    debito: Math.round(r.debito * 100) / 100,
    credito: Math.round(r.credito * 100) / 100,
  }));
}
