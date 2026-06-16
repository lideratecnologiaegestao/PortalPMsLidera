import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { DIARIO_TIPOS } from './diario.service';

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

@Injectable()
export class DiarioPdfService {
  /** Gera o PDF da edição. Retorna o buffer e o total de páginas. */
  async gerar(
    ed: EdicaoPdf,
    materias: MateriaPdf[],
    logoBuffer?: Buffer | null,
  ): Promise<{ buffer: Buffer; paginas: number }> {
    const qrDataUrl = await QRCode.toBuffer(ed.verifyUrl, { margin: 1, width: 220 });

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 64, bottom: 64, left: 56, right: 56 },
      bufferPages: true,
      info: {
        Title: ed.titulo,
        Author: ed.municipio ?? 'Município',
        Subject: `Diário Oficial — Edição nº ${ed.numero}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fim = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cinza = '#555555';
    const tipoEdicaoLabel = ed.tipoEdicao && ed.tipoEdicao !== 'ordinaria'
      ? ` (Edição ${ed.tipoEdicao})` : '';

    // ---- Capa ----
    if (logoBuffer) {
      try {
        const logoX = doc.page.margins.left + (largura - 90) / 2;
        doc.image(logoBuffer, logoX, doc.y, { width: 90 });
        doc.moveDown(0.5);
      } catch {
        // logo corrompido ou formato inesperado — continua sem imagem
      }
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text((ed.municipio ?? 'MUNICÍPIO').toUpperCase() + (ed.uf ? ` — ${ed.uf}` : ''), { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(20).text('DIÁRIO OFICIAL ELETRÔNICO', { align: 'center' });
    doc.font('Helvetica').fontSize(12).fillColor(cinza)
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
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(cinza)
        .text('Edição sem matérias estruturadas.');
    }

    // ---- Matérias ----
    for (const m of materias) {
      doc.addPage();
      const lbl = TIPO_LABEL[m.tipo] ?? m.tipo;
      doc.font('Helvetica').fontSize(8).fillColor(cinza)
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
        doc.font('Helvetica').fontSize(10.5).fillColor('#000').text(texto, { align: 'justify', lineGap: 1.5 });
      }
    }

    // ---- Rodapé (numeração) + box de autenticidade na capa (página 0) ----
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      const y = doc.page.height - 46;
      doc.font('Helvetica').fontSize(7.5).fillColor(cinza);
      doc.text(`Edição nº ${ed.numero} · ${dataBR(ed.dataEdicao)}`, doc.page.margins.left, y,
        { width: largura, align: 'left', lineBreak: false });
      doc.text(`Página ${i + 1} de ${total}`, doc.page.margins.left, y,
        { width: largura, align: 'right', lineBreak: false });
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
}
