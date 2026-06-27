import { extrairMovContabil } from './aplic-contabil.util';

// Lançamentos com os 3 grupos e os formatos de conta-corrente do TCE-MT.
const XML = `<DATAPACKET><ROWDATA>
<ROW ECTCE_Codigo="6212000000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="1.1.1.4.51.1.1.00.00.00|1|500|0000000|01" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="100.00"/>
<ROW ECTCE_Codigo="8211101000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="1|500|0000000" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="100.00"/>
<ROW ECTCE_Codigo="8211101000000" MCC_Data="03/01/2025" LCDTCE_ContaCorrente="1|500|0000000" LCDTCE_ValorDebito="30.00" LCDTCE_ValorCredito="0.00"/>
<ROW ECTCE_Codigo="1111102000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="748|0820-6|12150-1|2|1|540|0000000|101|00.000.000/0000-00" LCDTCE_ValorDebito="100.00" LCDTCE_ValorCredito="0.00"/>
<ROW ECTCE_Codigo="1111101000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="1|501|0000000|101|000.000.000-00" LCDTCE_ValorDebito="50.00" LCDTCE_ValorCredito="0.00"/>
<ROW ECTCE_Codigo="3000000000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="x" LCDTCE_ValorDebito="9.00" LCDTCE_ValorCredito="0.00"/>
</ROWDATA></DATAPACKET>`;

describe('extrairMovContabil', () => {
  const res = extrairMovContabil(XML);

  it('classifica receita/ddr/caixa e ignora contas fora de interesse', () => {
    const grupos = [...new Set(res.map((r) => r.grupo))].sort();
    expect(grupos).toEqual(['caixa', 'ddr', 'receita']);
    expect(res.some((r) => r.conta.startsWith('3'))).toBe(false);
  });

  it('receita (cc78): natureza no seg 0, fonte DRESP no seg 2', () => {
    const r = res.find((x) => x.grupo === 'receita')!;
    expect(r.natureza).toBe('1.1.1.4.51.1.1.00.00.00');
    expect(r.dresp).toBe('500');
    expect(r.credito).toBe(100);
  });

  it('ddr (cc68, 3 seg): fonte DRESP no seg 1; agrega por dia', () => {
    const ddr = res.filter((x) => x.grupo === 'ddr');
    expect(ddr.every((x) => x.dresp === '500')).toBe(true);
    // 2 dias distintos (02 e 03) → 2 linhas
    expect(ddr.length).toBe(2);
  });

  it('caixa banco (cc80, 9 seg): fonte no seg 5 (DRESP=540); caixa físico (cc76): seg 1 (DRESP=501)', () => {
    const banco = res.find((x) => x.grupo === 'caixa' && x.conta === '1111102000000')!;
    expect(banco.dresp).toBe('540');
    expect(banco.debito).toBe(100);
    const fisico = res.find((x) => x.grupo === 'caixa' && x.conta === '1111101000000')!;
    expect(fisico.dresp).toBe('501');
  });
});
