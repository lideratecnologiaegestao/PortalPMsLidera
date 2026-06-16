import PDFDocument from 'pdfkit';
import type { RelatorioDados } from './manifestacoes-admin.service';

const TIPO_LABEL: Record<string, string> = {
  acesso_informacao: 'Acesso à Informação (e-SIC)', denuncia: 'Denúncia',
  reclamacao: 'Reclamação', sugestao: 'Sugestão', elogio: 'Elogio', solicitacao: 'Solicitação',
};
const STATUS_LABEL: Record<string, string> = {
  registrada: 'Registrada', em_analise: 'Em análise', em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Aguardando cidadão', prorrogada: 'Prorrogada', respondida: 'Respondida',
  indeferida: 'Indeferida', parcialmente_atendida: 'Parcialmente atendida',
  recurso_1a_instancia: 'Recurso 1ª instância', recurso_2a_instancia: 'Recurso 2ª instância',
  concluida: 'Concluída', arquivada: 'Arquivada',
};
const lblTipo = (k: string) => TIPO_LABEL[k] ?? k;
const lblStatus = (k: string) => STATUS_LABEL[k] ?? k;

function periodoTexto(d: RelatorioDados): string {
  const { de, ate } = d.periodo;
  if (de && ate) return `Período: ${de} a ${ate}`;
  if (de) return `A partir de ${de}`;
  if (ate) return `Até ${ate}`;
  return 'Período: todo o histórico';
}

/** Linhas planas para export CSV (dimensão;item;quantidade). */
export function relatorioCsvRows(d: RelatorioDados): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  rows.push({ secao: 'Resumo', item: 'Total de manifestações', valor: d.resumo.total });
  rows.push({ secao: 'Resumo', item: 'Em aberto', valor: d.resumo.abertos });
  rows.push({ secao: 'Resumo', item: 'Respondidas/concluídas', valor: d.resumo.respondidas });
  rows.push({ secao: 'Resumo', item: 'Taxa de resposta (%)', valor: d.resumo.taxaResposta });
  d.porTipo.forEach((r) => rows.push({ secao: 'Por tipo', item: lblTipo(r.chave), valor: r.total }));
  d.porStatus.forEach((r) => rows.push({ secao: 'Por status', item: lblStatus(r.chave), valor: r.total }));
  d.porCanal.forEach((r) => rows.push({ secao: 'Por canal', item: r.chave, valor: r.total }));
  d.porSecretaria.forEach((r) => rows.push({ secao: 'Por secretaria', item: r.chave, valor: r.total }));
  rows.push({ secao: 'Satisfação', item: 'Avaliações', valor: d.satisfacao.total });
  rows.push({ secao: 'Satisfação', item: 'Média (1-5)', valor: d.satisfacao.media });
  d.satisfacao.distribuicao.forEach((r) => rows.push({ secao: 'Satisfação', item: `${r.nota} estrela(s)`, valor: r.total }));
  return rows;
}

function escXml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Relatório em Excel via SpreadsheetML 2003 (XML puro, sem dependência nova).
 * Servir como application/vnd.ms-excel, filename .xls — abre no Excel/LibreOffice.
 */
export function relatorioXlsx(d: RelatorioDados): string {
  const rows = relatorioCsvRows(d); // [{secao,item,valor}]
  const cell = (v: unknown, header = false) =>
    `<Cell${header ? ' ss:StyleID="h"' : ''}><Data ss:Type="String">${escXml(v)}</Data></Cell>`;
  const head = `<Row>${['Seção', 'Item', 'Quantidade'].map((h) => cell(h, true)).join('')}</Row>`;
  const body = rows
    .map((r) => `<Row>${cell(r.secao)}${cell(r.item)}${cell(r.valor)}</Row>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
  <Worksheet ss:Name="Relatorio"><Table>
    ${head}
    ${body}
  </Table></Worksheet>
</Workbook>`;
}

/** Relatório em HTML (servido como .doc — abre no Word). */
export function relatorioDoc(d: RelatorioDados, municipio: string): string {
  const tabela = (titulo: string, linhas: { chave: string; total: number }[]) =>
    `<h3>${titulo}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">` +
    `<tr><th align="left">Item</th><th>Quantidade</th></tr>` +
    linhas.map((l) => `<tr><td>${l.chave}</td><td align="center">${l.total}</td></tr>`).join('') +
    `</table>`;
  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial">
    <h1>Relatório de Ouvidoria — ${municipio}</h1>
    <p>${periodoTexto(d)}<br>Gerado em ${new Date(d.geradoEm).toLocaleString('pt-BR')}</p>
    <h3>Resumo</h3>
    <ul>
      <li>Total de manifestações: <b>${d.resumo.total}</b></li>
      <li>Em aberto: <b>${d.resumo.abertos}</b></li>
      <li>Respondidas/concluídas: <b>${d.resumo.respondidas}</b></li>
      <li>Taxa de resposta: <b>${d.resumo.taxaResposta}%</b></li>
    </ul>
    ${tabela('Por tipo', d.porTipo.map((r) => ({ chave: lblTipo(r.chave), total: r.total })))}
    ${tabela('Por status', d.porStatus.map((r) => ({ chave: lblStatus(r.chave), total: r.total })))}
    ${tabela('Por canal', d.porCanal)}
    ${tabela('Por secretaria', d.porSecretaria)}
    <h3>Pesquisa de satisfação</h3>
    <p>Avaliações: <b>${d.satisfacao.total}</b> · Média: <b>${d.satisfacao.media}</b> de 5</p>
    ${tabela('Distribuição', d.satisfacao.distribuicao.map((r) => ({ chave: `${r.nota} estrela(s)`, total: r.total })))}
  </body></html>`;
}

/** Relatório em PDF (pdfkit). */
export async function relatorioPdf(
  d: RelatorioDados,
  municipio: string,
  logoBuffer?: Buffer | null,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const fim = new Promise<void>((r) => doc.on('end', () => r()));

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, doc.page.margins.left, doc.y, { width: 90 });
      doc.moveDown(0.5);
    } catch {
      // logo corrompido ou formato inesperado — continua sem imagem
    }
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(`Relatório de Ouvidoria — ${municipio}`, { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#555').text(periodoTexto(d), { align: 'center' });
  doc.text(`Gerado em ${new Date(d.geradoEm).toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown();

  const resumo = (rot: string, v: number | string) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(`${rot}: `, { continued: true });
    doc.font('Helvetica').text(String(v));
  };
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Resumo'); doc.moveDown(0.3);
  resumo('Total de manifestações', d.resumo.total);
  resumo('Em aberto', d.resumo.abertos);
  resumo('Respondidas/concluídas', d.resumo.respondidas);
  resumo('Taxa de resposta', `${d.resumo.taxaResposta}%`);
  doc.moveDown(0.6);

  const tabela = (titulo: string, linhas: { chave: string; total: number }[]) => {
    if (!linhas.length) return;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(titulo); doc.moveDown(0.2);
    const x = doc.page.margins.left;
    const largura = doc.page.width - x - doc.page.margins.right;
    for (const l of linhas) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(l.chave, x, y, { width: largura - 60 });
      doc.text(String(l.total), x, y, { width: largura, align: 'right' });
    }
    doc.moveDown(0.6);
  };
  tabela('Por tipo', d.porTipo.map((r) => ({ chave: lblTipo(r.chave), total: r.total })));
  tabela('Por status', d.porStatus.map((r) => ({ chave: lblStatus(r.chave), total: r.total })));
  tabela('Por canal', d.porCanal);
  tabela('Por secretaria', d.porSecretaria);
  doc.font('Helvetica-Bold').fontSize(12).text(`Satisfação — média ${d.satisfacao.media} de 5 (${d.satisfacao.total} avaliações)`);
  doc.moveDown(0.2);
  tabela('Distribuição das notas', d.satisfacao.distribuicao.map((r) => ({ chave: `${r.nota} estrela(s)`, total: r.total })));

  doc.end();
  await fim;
  return Buffer.concat(chunks);
}
