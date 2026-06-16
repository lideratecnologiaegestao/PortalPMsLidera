/**
 * Gera um PDF mínimo válido (1 página A4, Helvetica) — sem dependência externa.
 *
 * Usado nos "documentos de exemplo" do provisionamento: cada documento essencial
 * do PNTP (PPA, LDO, LOA, RGF, RREO, Balanço, etc.) nasce apontando para um
 * arquivo que BAIXA DE VERDADE, deixando explícito que a prefeitura deve
 * substituí-lo pelo arquivo oficial. Assim o link entregue ao cidadão nunca é
 * 404 e o critério PNTP correspondente é atendido de fato (e não só no banco).
 */
export function gerarPdfModelo(titulo: string, linhas: string[]): Buffer {
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  let texto = `BT /F1 18 Tf 56 780 Td (${esc(titulo)}) Tj ET\n`;
  let y = 744;
  for (const l of linhas) {
    texto += `BT /F1 11 Tf 56 ${y} Td (${esc(l)}) Tj ET\n`;
    y -= 20;
  }

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(texto, 'latin1')} >>\nstream\n${texto}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Catálogo dos documentos-modelo. A chave é a `categoria` do critério PNTP
 * (transp_documentos.categoria). Mantém o título amigável e a descrição que
 * aparece no PDF de exemplo.
 */
export const MODELOS_DOC: Record<string, { titulo: string; descricao: string }> = {
  ppa: { titulo: 'Plano Plurianual (PPA)', descricao: 'Lei do PPA e seus anexos (planejamento de 4 anos).' },
  ldo: { titulo: 'Lei de Diretrizes Orçamentárias (LDO)', descricao: 'LDO e anexos do exercício.' },
  loa: { titulo: 'Lei Orçamentária Anual (LOA)', descricao: 'LOA e anexos do exercício.' },
  rgf: { titulo: 'Relatório de Gestão Fiscal (RGF)', descricao: 'RGF quadrimestral (LRF).' },
  rreo: { titulo: 'Relatório Resumido da Execução Orçamentária (RREO)', descricao: 'RREO bimestral (LRF).' },
  balanco_geral: { titulo: 'Balanço Geral / Prestação de Contas', descricao: 'Balanço geral anual do município.' },
  prestacao_contas: { titulo: 'Prestação de Contas', descricao: 'Prestação de contas anual do exercício.' },
  regulamento_lai: { titulo: 'Regulamentação local da LAI', descricao: 'Decreto municipal que regulamenta a Lei de Acesso à Informação.' },
  relatorio_estatistico_sic: { titulo: 'Relatório Estatístico do e-SIC', descricao: 'Relatório anual de pedidos de informação.' },
  carta_servicos: { titulo: 'Carta de Serviços ao Usuário', descricao: 'Serviços prestados, requisitos e prazos (Lei 13.460/2017).' },
  plano_contratacoes: { titulo: 'Plano de Contratações Anual (PCA)', descricao: 'Plano anual de contratações (Lei 14.133/2021).' },
  edital_licitacao: { titulo: 'Edital de Licitação', descricao: 'Íntegra do edital de licitação.' },
  contrato: { titulo: 'Contrato Administrativo', descricao: 'Inteiro teor do contrato.' },
  concurso: { titulo: 'Edital de Concurso Público', descricao: 'Edital de concurso ou processo seletivo.' },
};

/** Monta o PDF-modelo de uma categoria de documento de transparência. */
export function pdfModeloDaCategoria(categoria: string): { nome: string; pdf: Buffer } {
  const m = MODELOS_DOC[categoria] ?? {
    titulo: 'Documento de Transparência',
    descricao: 'Documento de transparência ativa.',
  };
  const pdf = gerarPdfModelo(m.titulo, [
    m.descricao,
    '',
    'DOCUMENTO DE EXEMPLO gerado automaticamente pela plataforma.',
    'A prefeitura deve substituí-lo pelo arquivo oficial em',
    'Admin > Transparência > Documentos (enviar arquivo ou informar a URL).',
    '',
    'Enquanto este exemplo estiver publicado, o portal cumpre a estrutura',
    'exigida pelo PNTP/Atricon, mas o conteúdo oficial ainda é pendente.',
  ]);
  return { nome: `${categoria}.pdf`, pdf };
}
