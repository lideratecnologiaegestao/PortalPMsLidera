import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { DIARIO_TIPOS } from './diario.service';
import type { HinoTexto } from './hinos-nacionais';

const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  DIARIO_TIPOS.map((t) => [t.slug, t.nome]),
);

export interface MateriaPdf {
  tipo: string;
  numeroAto: string | null;
  titulo: string;
  ementa: string | null;
  conteudo: string;
  orgao: string | null;
}

export interface EdicaoPdf {
  numero: string;
  dataEdicao: Date;
  titulo: string;
  conteudo: string;
  tipoEdicao: string;
  hash: string | null;
  municipio?: string | null;
  uf?: string | null;
  verifyUrl: string; // URL pública de verificação (entra no QR)
}

/** Dados institucionais para cabeçalho/rodapé. */
export interface EntidadePdf {
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
  horario?: string | null;
  telefone?: string | null;
}

/** Layout configurável do PDF. */
export interface LayoutPdf {
  colunas: number; // 1 | 2
  cabecalhoAtivo: boolean;
  rodapeAtivo: boolean;
  incluirHinos: boolean;
}

/** Hinos das páginas finais (município + estado + bandeira + nacional). */
export interface HinosPdf {
  municipio?: HinoTexto | null;
  estado?: HinoTexto | null;
  bandeira: HinoTexto;
  nacional: HinoTexto;
}

export interface OpcoesPdf {
  logoBuffer?: Buffer | null;
  brasaoBuffer?: Buffer | null;
  entidade: EntidadePdf;
  layout: LayoutPdf;
  hinos?: HinosPdf | null;
}

/** Converte HTML simples em texto com quebras de parágrafo preservadas. */
function htmlParaTexto(html: string): string {
  return (html || '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function dataBR(d: Date): string {
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

const CINZA = '#555555';

@Injectable()
export class DiarioPdfService {
  /** Gera o PDF da edição. Retorna o buffer e o total de páginas. */
  async gerar(
    ed: EdicaoPdf,
    materias: MateriaPdf[],
    opts: OpcoesPdf,
  ): Promise<{ buffer: Buffer; paginas: number }> {
    const { logoBuffer, brasaoBuffer, entidade, layout, hinos } = opts;
    const qrDataUrl = await QRCode.toBuffer(ed.verifyUrl, { margin: 1, width: 220 });

    // Margens: reserva espaço no topo p/ o cabeçalho corrido e embaixo p/ o rodapé.
    const top = layout.cabecalhoAtivo ? 96 : 64;
    const bottom = layout.rodapeAtivo ? 74 : 56;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top, bottom, left: 56, right: 56 },
      bufferPages: true,
      info: {
        Title: ed.titulo,
        Author: entidade.nome || ed.municipio || 'Entidade',
        Subject: `Diário Oficial — Edição nº ${ed.numero}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fim = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tipoEdicaoLabel =
      ed.tipoEdicao && ed.tipoEdicao !== 'ordinaria' ? ` (Edição ${ed.tipoEdicao})` : '';

    // ---- Capa ----
    if (logoBuffer) {
      try {
        const logoX = doc.page.margins.left + (largura - 90) / 2;
        doc.image(logoBuffer, logoX, doc.y, { width: 90 });
        doc.moveDown(0.5);
      } catch {
        /* logo corrompido — segue sem imagem */
      }
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text((entidade.nome || ed.municipio || 'ENTIDADE').toUpperCase() + (ed.uf ? ` — ${ed.uf}` : ''), { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(20).text('DIÁRIO OFICIAL ELETRÔNICO', { align: 'center' });
    doc.font('Helvetica').fontSize(12).fillColor(CINZA)
      .text(`Edição nº ${ed.numero}${tipoEdicaoLabel} · ${dataBR(ed.dataEdicao)}`, { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    if (ed.conteudo && htmlParaTexto(ed.conteudo)) {
      doc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(htmlParaTexto(ed.conteudo), { align: 'justify' });
      doc.moveDown(0.8);
    }

    // ---- Sumário ----
    const grupos = new Map<string, MateriaPdf[]>();
    for (const m of materias) {
      const k = m.orgao || 'Atos Diversos';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(m);
    }

    if (materias.length) {
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('SUMÁRIO');
      doc.moveDown(0.3);
      for (const [orgao, lista] of grupos) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#222').text(orgao);
        for (const m of lista) {
          const lbl = TIPO_LABEL[m.tipo] ?? m.tipo;
          doc.font('Helvetica').fontSize(9.5).fillColor('#444')
            .text(`${lbl}${m.numeroAto ? ` ${m.numeroAto}` : ''} — ${m.titulo}`, { indent: 14 });
        }
        doc.moveDown(0.2);
      }
    } else {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(CINZA)
        .text('Edição sem matérias estruturadas.');
    }

    // ---- Matérias (corpo em 1 ou 2 colunas) ----
    const colunas = layout.colunas === 1 ? 1 : 2;
    for (const m of materias) {
      doc.addPage();
      const lbl = TIPO_LABEL[m.tipo] ?? m.tipo;
      doc.font('Helvetica').fontSize(8).fillColor(CINZA)
        .text(`${m.orgao || 'Atos Diversos'} · ${lbl}`.toUpperCase());
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
        .text(`${m.numeroAto ? `${m.numeroAto} — ` : ''}${m.titulo}`);
      if (m.ementa) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#333').text(m.ementa);
      }
      doc.moveDown(0.4);
      const texto = htmlParaTexto(m.conteudo);
      if (texto) {
        doc.font('Helvetica').fontSize(10.5).fillColor('#000').text(texto, {
          align: 'justify',
          lineGap: 1.5,
          columns: colunas,
          columnGap: 18,
          width: largura,
        });
      }
    }

    // ---- Páginas finais: hinos e brasão ----
    if (layout.incluirHinos && hinos) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#000').text('SÍMBOLOS OFICIAIS', { align: 'center' });
      doc.moveDown(0.4);

      // Hino do Município (+ brasão)
      if (hinos.municipio) {
        if (brasaoBuffer) {
          try {
            const bw = 72;
            const y0 = doc.y;
            // fit limita LARGURA e ALTURA a bw → o avanço de doc.y nunca sobrepõe o texto
            doc.image(brasaoBuffer, doc.page.margins.left + (largura - bw) / 2, y0, { fit: [bw, bw], align: 'center' });
            doc.y = y0 + bw + 8;
          } catch {
            /* brasão inválido — segue sem imagem */
          }
        }
        this.hino(doc, hinos.municipio);
      }
      if (hinos.estado) this.hino(doc, hinos.estado);
      this.hino(doc, hinos.bandeira);
      this.hino(doc, hinos.nacional);
    }

    // ---- Cabeçalho e rodapé corridos + box de autenticidade ----
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      if (layout.cabecalhoAtivo && i > 0) this.cabecalho(doc, ed, entidade, brasaoBuffer, largura);
      this.rodape(doc, ed, entidade, layout, largura, i, total);
    }

    // Box de autenticidade + QR no fim da capa.
    doc.switchToPage(range.start);
    const boxY = doc.page.height - 150;
    doc.roundedRect(doc.page.margins.left, boxY, largura, 86, 4).strokeColor('#cccccc').stroke();
    doc.image(qrDataUrl, doc.page.margins.left + 8, boxY + 8, { width: 70 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000')
      .text('AUTENTICIDADE', doc.page.margins.left + 88, boxY + 10);
    doc.font('Helvetica').fontSize(7.5).fillColor('#333')
      .text(`Verifique em: ${ed.verifyUrl}`, doc.page.margins.left + 88, boxY + 24, { width: largura - 96 });
    if (ed.hash) {
      doc.font('Helvetica').fontSize(6.5).fillColor('#666')
        .text(`Código (SHA-256): ${ed.hash}`, doc.page.margins.left + 88, boxY + 44, { width: largura - 96 });
    }
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#888')
      .text('Documento assinado digitalmente. A autenticidade pode ser conferida no endereço acima.',
        doc.page.margins.left + 88, boxY + 66, { width: largura - 96 });

    doc.end();
    await fim;
    return { buffer: Buffer.concat(chunks), paginas: total };
  }

  /** Renderiza um hino (título + autores + letra centralizada). */
  private hino(doc: PDFKit.PDFDocument, h: HinoTexto): void {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(h.titulo, { align: 'center' });
    if (h.autores) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(h.autores, { align: 'center' });
    }
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(h.letra, { align: 'center', lineGap: 1 });
  }

  /** Cabeçalho corrido: brasão + nome da entidade + identificação da edição. */
  private cabecalho(
    doc: PDFKit.PDFDocument,
    ed: EdicaoPdf,
    entidade: EntidadePdf,
    brasao: Buffer | null | undefined,
    largura: number,
  ): void {
    const x = doc.page.margins.left;
    let textoX = x;
    if (brasao) {
      try {
        doc.image(brasao, x, 30, { height: 34 });
        textoX = x + 42;
      } catch {
        /* brasão inválido */
      }
    }
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
      .text(entidade.nome + (ed.uf ? ` — ${ed.uf}` : ''), textoX, 32, { width: largura - (textoX - x), lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(CINZA)
      .text(`Diário Oficial Eletrônico · Edição nº ${ed.numero} · ${dataBR(ed.dataEdicao)}`, textoX, 46,
        { width: largura - (textoX - x), lineBreak: false });
    doc.moveTo(x, 68).lineTo(doc.page.width - doc.page.margins.right, 68).strokeColor('#dddddd').stroke();
  }

  /** Rodapé corrido: dados institucionais (se ativo) + numeração de páginas. */
  private rodape(
    doc: PDFKit.PDFDocument,
    ed: EdicaoPdf,
    entidade: EntidadePdf,
    layout: LayoutPdf,
    largura: number,
    i: number,
    total: number,
  ): void {
    const x = doc.page.margins.left;
    if (layout.rodapeAtivo) {
      const linha1 = [entidade.nome, entidade.cnpj ? `CNPJ ${entidade.cnpj}` : null]
        .filter(Boolean).join(' · ');
      const linha2 = [entidade.endereco, entidade.telefone, entidade.horario]
        .filter(Boolean).join(' · ');
      const y1 = doc.page.height - 58;
      doc.font('Helvetica').fontSize(6.8).fillColor(CINZA);
      if (linha1) doc.text(linha1, x, y1, { width: largura, align: 'center', lineBreak: false });
      if (linha2) doc.text(linha2, x, y1 + 10, { width: largura, align: 'center', lineBreak: false });
      doc.text(`Edição nº ${ed.numero} · ${dataBR(ed.dataEdicao)}`, x, y1 + 22, { width: largura, align: 'left', lineBreak: false });
      doc.text(`Página ${i + 1} de ${total}`, x, y1 + 22, { width: largura, align: 'right', lineBreak: false });
    } else {
      const y = doc.page.height - 46;
      doc.font('Helvetica').fontSize(7.5).fillColor(CINZA);
      doc.text(`Edição nº ${ed.numero} · ${dataBR(ed.dataEdicao)}`, x, y, { width: largura, align: 'left', lineBreak: false });
      doc.text(`Página ${i + 1} de ${total}`, x, y, { width: largura, align: 'right', lineBreak: false });
    }
  }
}
