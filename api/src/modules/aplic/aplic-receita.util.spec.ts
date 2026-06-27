import { extrairReceitaArrecadada } from './aplic-receita.util';

// DATAPACKET mínimo com lançamentos de receita realizada (6.2.1.2) e dedução (6.2.1.3).
const XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DATAPACKET version="2.0"><ROWDATA>
<ROW ECTCE_Codigo="6212000000000" MCC_Data="02/01/2025" LCDTCE_ContaCorrente="1.1.1.4.51.1.1.00.00.00|1|500|0000000|01" LCDTCE_Historico="REFERE-SE A ARRECADAÇÃO DE 1.1.1.4.51.1.1.00.00.00 ISS - PRINCIPAL" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="100.00"/>
<ROW ECTCE_Codigo="6212000000000" MCC_Data="03/01/2025" LCDTCE_ContaCorrente="1.1.1.4.51.1.1.00.00.00|1|500|0000000|01" LCDTCE_Historico="ARRECADAÇÃO DE 1.1.1.4.51.1.1.00.00.00 ISS - PRINCIPAL" LCDTCE_ValorDebito="10.00" LCDTCE_ValorCredito="40.00"/>
<ROW ECTCE_Codigo="6212000000000" MCC_Data="03/01/2025" LCDTCE_ContaCorrente="1.1.2.1.01.0.1.00.00.00|1|501|0000000|01" LCDTCE_Historico="ARRECADAÇÃO DE 1.1.2.1.01.0.1.00.00.00 TAXAS" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="76.51"/>
<ROW ECTCE_Codigo="6213100000000" MCC_Data="03/01/2025" LCDTCE_ContaCorrente="1.1.1.8.01.2.0.00.00.00|1|500|0000000|01" LCDTCE_Historico="DEDUÇÃO FUNDEB" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="5.00"/>
<ROW ECTCE_Codigo="1110100000000" LCDTCE_ContaCorrente="x" LCDTCE_ValorDebito="0.00" LCDTCE_ValorCredito="999.00"/>
</ROWDATA></DATAPACKET>`;

describe('extrairReceitaArrecadada', () => {
  const res = extrairReceitaArrecadada(XML);

  it('agrupa por natureza (1º segmento da conta-corrente) e soma crédito − débito', () => {
    const iss = res.find((r) => r.codigo === '1.1.1.4.51.1.1.00.00.00');
    expect(iss?.arrecadado).toBe(130); // 100 + (40-10)
    const taxas = res.find((r) => r.codigo === '1.1.2.1.01.0.1.00.00.00');
    expect(taxas?.arrecadado).toBe(76.51);
  });

  it('separa deduções (6.2.1.3) do arrecadado', () => {
    const ded = res.find((r) => r.codigo === '1.1.1.8.01.2.0.00.00.00');
    expect(ded?.deducao).toBe(5);
    expect(ded?.arrecadado).toBe(0);
  });

  it('ignora contas fora do controle da receita (ex.: 1.1.x)', () => {
    expect(res.some((r) => r.codigo === 'x')).toBe(false);
  });

  it('extrai o nome da natureza do histórico', () => {
    const iss = res.find((r) => r.codigo === '1.1.1.4.51.1.1.00.00.00');
    expect(iss?.nome).toMatch(/ISS/);
  });
});
