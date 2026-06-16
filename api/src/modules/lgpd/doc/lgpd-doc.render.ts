/**
 * Renderiza a documentação LGPD a partir do template marcado (ver
 * lgpd-template.const.ts) e dos dados da entidade, nos formatos HTML, TXT e PDF.
 *
 * O template usa marcação leve:
 *   # / ## / ###  → títulos (h1 = documento, quebra de página no PDF)
 *   - item        → lista
 *   linha vazia separa parágrafos.
 * Placeholders {{X}} são substituídos por `aplicarVars`.
 *
 * Sem dependência externa: o PDF é um arquivo válido gerado à mão (multipágina,
 * Helvetica/Helvetica-Bold, A4), no mesmo espírito de modelo-pdf.util.ts.
 */

export type VarsLgpd = Record<string, string>;

/** Substitui {{CHAVE}} pelos valores (faltantes viram '—'). */
export function aplicarVars(template: string, vars: VarsLgpd): string {
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_m, chave: string) => {
    const v = vars[chave];
    return v != null && String(v).trim() !== '' ? String(v) : '—';
  });
}

// ─── Parser de blocos ──────────────────────────────────────────────────────────

type BlocoTipo = 'h1' | 'h2' | 'h3' | 'li' | 'p';
interface Bloco { tipo: BlocoTipo; texto: string }

function parseBlocos(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const flush = () => {
    if (paragrafo.length) {
      blocos.push({ tipo: 'p', texto: paragrafo.join(' ').trim() });
      paragrafo = [];
    }
  };
  for (const raw of linhas) {
    const l = raw.trimEnd();
    if (l.trim() === '') { flush(); continue; }
    if (l.startsWith('### ')) { flush(); blocos.push({ tipo: 'h3', texto: l.slice(4).trim() }); }
    else if (l.startsWith('## ')) { flush(); blocos.push({ tipo: 'h2', texto: l.slice(3).trim() }); }
    else if (l.startsWith('# ')) { flush(); blocos.push({ tipo: 'h1', texto: l.slice(2).trim() }); }
    else if (l.startsWith('- ')) { flush(); blocos.push({ tipo: 'li', texto: l.slice(2).trim() }); }
    else paragrafo.push(l.trim());
  }
  flush();
  return blocos;
}

// ─── HTML ───────────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fragmento HTML (sem <html>/<head>) — usado na página pública e no preview. */
export function renderHtmlFragmento(texto: string): string {
  const blocos = parseBlocos(texto);
  const out: string[] = [];
  let emLista = false;
  const fecharLista = () => { if (emLista) { out.push('</ul>'); emLista = false; } };
  for (const b of blocos) {
    if (b.tipo === 'li') {
      if (!emLista) { out.push('<ul>'); emLista = true; }
      out.push(`<li>${escHtml(b.texto)}</li>`);
      continue;
    }
    fecharLista();
    if (b.tipo === 'h1') out.push(`<h2 class="lgpd-doc-titulo">${escHtml(b.texto)}</h2>`);
    else if (b.tipo === 'h2') out.push(`<h3>${escHtml(b.texto)}</h3>`);
    else if (b.tipo === 'h3') out.push(`<h4>${escHtml(b.texto)}</h4>`);
    else out.push(`<p>${escHtml(b.texto)}</p>`);
  }
  fecharLista();
  return out.join('\n');
}

/** Documento HTML completo e autossuficiente (para download). */
export function renderHtmlDocumento(texto: string, titulo: string): string {
  const fragmento = renderHtmlFragmento(texto);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(titulo)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; color: #1a1a1a;
         max-width: 820px; margin: 0 auto; padding: 40px 24px; background: #fff; }
  h2.lgpd-doc-titulo { font-size: 1.4rem; margin: 2.4em 0 0.8em; padding-bottom: .3em;
         border-bottom: 2px solid #1351b4; color: #1351b4; page-break-before: always; }
  h2.lgpd-doc-titulo:first-of-type { page-break-before: avoid; }
  h3 { font-size: 1.1rem; margin: 1.6em 0 .5em; color: #0c326f; }
  h4 { font-size: 1rem; margin: 1.2em 0 .4em; color: #333; }
  p { margin: .6em 0; text-align: justify; }
  ul { margin: .6em 0; padding-left: 1.4em; }
  li { margin: .25em 0; }
  @media print { body { max-width: none; padding: 0; } }
</style>
</head>
<body>
${fragmento}
</body>
</html>`;
}

// ─── TXT ──────────────────────────────────────────────────────────────────────

export function renderTxt(texto: string): string {
  const blocos = parseBlocos(texto);
  const out: string[] = [];
  for (const b of blocos) {
    if (b.tipo === 'h1') {
      out.push('', '='.repeat(70), b.texto.toUpperCase(), '='.repeat(70), '');
    } else if (b.tipo === 'h2') {
      out.push('', b.texto, '-'.repeat(Math.min(70, b.texto.length)));
    } else if (b.tipo === 'h3') {
      out.push('', b.texto);
    } else if (b.tipo === 'li') {
      out.push(`  • ${b.texto}`);
    } else {
      out.push(quebrar(b.texto, 90).join('\n'));
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ─── PDF multipágina (sem dependência) ──────────────────────────────────────────

interface ItemPdf { texto: string; font: 'F1' | 'F2'; size: number; lh: number; gap: number; quebraPagina?: boolean; bullet?: boolean }

const PAGE_W = 595, PAGE_H = 842, MARGIN = 56;
const TOP_Y = PAGE_H - MARGIN, BOTTOM_Y = MARGIN;
const USABLE_W = PAGE_W - 2 * MARGIN;

/** Quebra um texto em linhas por número aproximado de caracteres. */
function quebrar(texto: string, maxChars: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (atual === '') atual = p;
    else if ((atual + ' ' + p).length <= maxChars) atual += ' ' + p;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

function blocosParaItens(texto: string): ItemPdf[] {
  const blocos = parseBlocos(texto);
  const itens: ItemPdf[] = [];
  let primeiroH1 = true;
  for (const b of blocos) {
    if (b.tipo === 'h1') {
      itens.push({ texto: b.texto, font: 'F2', size: 14, lh: 18, gap: 20, quebraPagina: !primeiroH1 });
      primeiroH1 = false;
    } else if (b.tipo === 'h2') {
      itens.push({ texto: b.texto, font: 'F2', size: 12, lh: 16, gap: 14 });
    } else if (b.tipo === 'h3') {
      itens.push({ texto: b.texto, font: 'F2', size: 11, lh: 14, gap: 9 });
    } else if (b.tipo === 'li') {
      itens.push({ texto: b.texto, font: 'F1', size: 10, lh: 13, gap: 2, bullet: true });
    } else {
      itens.push({ texto: b.texto, font: 'F1', size: 10, lh: 13, gap: 6 });
    }
  }
  return itens;
}

function escPdf(s: string): string {
  // Mantém só Latin-1 (WinAnsi) — acentos do PT estão na faixa; fora dela vira '?'.
  return s
    .split('')
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : '?'))
    .join('')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Gera o PDF completo da documentação (multipágina, A4). */
export function renderPdf(texto: string): Buffer {
  const itens = blocosParaItens(texto);

  // 1) Quebra em páginas, acumulando y.
  const paginas: string[] = [];
  let stream = '';
  let y = TOP_Y;
  const novaPagina = () => { if (stream) paginas.push(stream); stream = ''; y = TOP_Y; };

  const desenhar = (linha: string, font: string, size: number, x: number) => {
    stream += `BT /${font} ${size} Tf ${x} ${y.toFixed(1)} Td (${escPdf(linha)}) Tj ET\n`;
  };

  for (const it of itens) {
    if (it.quebraPagina) novaPagina();
    y -= it.gap;
    const maxChars = Math.max(20, Math.floor(USABLE_W / (it.size * 0.52)));
    const prefixo = it.bullet ? '• ' : '';
    const linhas = quebrar((it.bullet ? prefixo : '') + it.texto, maxChars);
    linhas.forEach((ln, idx) => {
      if (y < BOTTOM_Y) novaPagina();
      const x = MARGIN + (it.bullet && idx > 0 ? 10 : 0); // recuo de continuação dos itens
      desenhar(ln, it.font, it.size, x);
      y -= it.lh;
    });
  }
  novaPagina();
  if (paginas.length === 0) paginas.push('');

  // 2) Monta os objetos PDF.
  // 1 Catalog, 2 Pages, 3 Font F1, 4 Font F2, depois pares (Page, Contents).
  const objs: string[] = [];
  const nPaginas = paginas.length;
  const kids: string[] = [];
  const basePagina = 5; // primeiro objeto de página
  for (let i = 0; i < nPaginas; i++) kids.push(`${basePagina + i * 2} 0 R`);

  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${nPaginas} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  for (let i = 0; i < nPaginas; i++) {
    const contentsObj = basePagina + i * 2 + 1;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentsObj} 0 R >>`,
    );
    const body = paginas[i];
    objs.push(`<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}endstream`);
  }

  // 3) Serializa com xref.
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}
