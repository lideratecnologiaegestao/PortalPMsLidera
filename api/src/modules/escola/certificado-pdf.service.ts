import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { StorageService } from '../storage/storage.service';

/**
 * Geração do PDF do certificado a partir de um template visual
 * (certificate_templates + textos/elementos/fotos) com placeholders preenchidos
 * e QR de validação pública. Mesmo padrão do DiarioPdfService: monta o buffer
 * com pdfkit, embute o QRCode e lê mídia do StorageService. Quando não há
 * template configurado, cai para um layout-PADRÃO sóbrio — sempre gera um PDF
 * válido. Ver db/106_escola_legislativa.sql e specs/escola-legislativa.md.
 */

/** Linha de curso_certificados necessária para a renderização (snapshots). */
export interface CertificadoPdfInput {
  codigo: string;
  nomeAluno: string;
  tituloCurso: string;
  cargaHoraria: number | null;
  templateId: string | null;
  emitidoEm: Date;
  dataInicio?: Date | null;
  dataConclusao?: Date | null;
  conteudoProgramatico?: string | null;
  cpf?: string | null;
  rg?: string | null;
}

/** Uma página do template: fundo próprio + itens (dimensão é global do template). */
export interface TemplatePagina {
  fundoUrl: string | null;
  fundoStorageKey: string | null;
  ordem: number | null;
  textos: TemplateTexto[];
  elementos: TemplateElemento[];
  fotos: TemplateFoto[];
}

/** Template carregado via prisma include (paginas → textos/elementos/fotos). */
export interface CertificadoTemplate {
  largura: number;
  altura: number;
  // fundo legado/default do template (usado na 1ª página quando a página não tem fundo próprio)
  fundoUrl: string | null;
  fundoStorageKey: string | null;
  paginas: TemplatePagina[];
}
export interface TemplateTexto {
  conteudo: string;
  posX: unknown;
  posY: unknown;
  largura: unknown;
  fonte: string | null;
  tamanho: number | null;
  cor: string | null;
  alinhamento: string | null;
  negrito: boolean | null;
  ordem: number | null;
}
export interface TemplateElemento {
  tipo: string;
  posX: unknown;
  posY: unknown;
  largura: unknown;
  altura: unknown;
  config: unknown;
  ordem: number | null;
}
export interface TemplateFoto {
  url: string | null;
  storageKey: string | null;
  posX: unknown;
  posY: unknown;
  largura: unknown;
  altura: unknown;
  ordem: number | null;
}

/** Converte Prisma.Decimal | number | string | null em number (default 0). */
function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Igual em number, mas devolve undefined quando ausente (largura/altura opcionais). */
function numOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function dataBR(d: Date): string {
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

/** Máscara 000.000.000-00 quando há 11 dígitos; senão devolve o valor bruto. */
function mascararCpf(cpf?: string | null): string {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return (cpf ?? '').trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** pdfkit embute apenas as 14 fontes-padrão; mapeia qualquer fonte p/ Helvetica. */
function fontePadrao(negrito: boolean): string {
  return negrito ? 'Helvetica-Bold' : 'Helvetica';
}

@Injectable()
export class CertificadoPdfService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Gera o PDF do certificado. `urlValidacao` entra no QR e é montada pelo
   * chamador (base pública + /validar/:codigo), reaproveitando o padrão de
   * URL pública do diário. Retorna o buffer pronto p/ servir/armazenar.
   */
  async gerarPdf(
    cert: CertificadoPdfInput,
    template: CertificadoTemplate | null,
    urlValidacao: string,
  ): Promise<Buffer> {
    const largura = template?.largura ?? 842;
    const altura = template?.altura ?? 595;

    const doc = new PDFDocument({
      size: [largura, altura],
      margin: 0,
      info: {
        Title: `Certificado — ${cert.tituloCurso}`,
        Author: cert.nomeAluno,
        Subject: `Certificado ${cert.codigo}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fim = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    const paginas = template?.paginas ?? [];
    // Template "vazio" (sem fundo nem itens em nenhuma página) → layout padrão,
    // evitando um certificado em branco.
    const temConteudo = !!(
      template &&
      (template.fundoStorageKey ||
        template.fundoUrl ||
        paginas.some(
          (p) => p.fundoUrl || p.fundoStorageKey || p.textos?.length || p.elementos?.length || p.fotos?.length,
        ))
    );

    if (temConteudo) {
      // Dimensão é global; cada página tem seu fundo + itens. addPage() a partir da 2ª.
      const total = Math.max(1, paginas.length);
      for (let i = 0; i < total; i++) {
        const pg = paginas[i];
        if (i > 0) doc.addPage({ size: [largura, altura], margin: 0 });

        // Fundo da página. O fallback ao fundo legado do template só vale quando
        // NÃO há linha de página (pré-backfill); uma página com fundo nulo é
        // respeitada como "sem fundo" (não reexibe o legado).
        const fundoKey = pg ? pg.fundoStorageKey : i === 0 ? template!.fundoStorageKey : null;
        const fundoUrl = pg ? pg.fundoUrl : i === 0 ? template!.fundoUrl : null;
        const fundo = await this.carregarImagem(fundoKey, fundoUrl);
        if (fundo) {
          try {
            doc.image(fundo, 0, 0, { width: largura, height: altura });
          } catch {
            // imagem corrompida/formato inesperado — segue sem fundo
          }
        }

        if (pg) await this.renderizarPagina(doc, pg, cert, urlValidacao, i + 1, total);
      }
    } else {
      await this.renderizarPadrao(doc, cert, urlValidacao, largura, altura);
    }

    doc.end();
    await fim;
    return Buffer.concat(chunks);
  }

  // ===================================================== render de UMA página
  private async renderizarPagina(
    doc: PDFKit.PDFDocument,
    template: TemplatePagina,
    cert: CertificadoPdfInput,
    urlValidacao: string,
    numeroPagina: number,
    totalPaginas: number,
  ): Promise<void> {
    // Fotos primeiro (logo/assinatura digitalizada ficam sob os textos).
    const fotos = [...template.fotos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    for (const f of fotos) {
      const buf = await this.carregarImagem(f.storageKey, f.url);
      if (!buf) continue;
      try {
        doc.image(buf, num(f.posX), num(f.posY), {
          width: numOrUndefined(f.largura),
          height: numOrUndefined(f.altura),
        });
      } catch {
        // imagem inválida — ignora sem quebrar o PDF
      }
    }

    // Elementos (linhas, retângulos, QR, assinatura).
    const elementos = [...template.elementos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    for (const el of elementos) {
      const x = num(el.posX);
      const y = num(el.posY);
      const w = num(el.largura);
      const h = num(el.altura);
      const config = (el.config ?? {}) as Record<string, unknown>;
      const cor = typeof config.cor === 'string' ? config.cor : '#000000';

      if (el.tipo === 'qr') {
        const qr = await QRCode.toBuffer(urlValidacao, { margin: 1, width: 220 });
        try {
          // QR é quadrado: usa um único lado p/ não distorcer (leitura confiável).
          const lado = w || h || 100;
          doc.image(qr, x, y, { width: lado, height: lado });
        } catch {
          // ignora QR inválido
        }
      } else if (el.tipo === 'linha' || el.tipo === 'assinatura') {
        // assinatura = linha de apoio para a rubrica (sem mais nada).
        doc.save();
        doc.moveTo(x, y).lineTo(x + (w || 0), y).strokeColor(cor).stroke();
        doc.restore();
      } else if (el.tipo === 'retangulo') {
        doc.save();
        doc.rect(x, y, w, h).strokeColor(cor).stroke();
        doc.restore();
      }
    }

    // Textos (com placeholders substituídos), na ordem definida.
    const textos = [...template.textos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    for (const t of textos) {
      const conteudo = this.aplicarPlaceholders(t.conteudo, cert, numeroPagina, totalPaginas);
      const align = (['left', 'center', 'right'].includes(t.alinhamento ?? '')
        ? t.alinhamento
        : 'left') as 'left' | 'center' | 'right';
      doc
        .font(fontePadrao(!!t.negrito))
        .fontSize(t.tamanho ?? 16)
        .fillColor(t.cor || '#000000')
        .text(conteudo, num(t.posX), num(t.posY), {
          width: numOrUndefined(t.largura),
          align,
        });
    }
  }

  // ===================================================== layout-PADRÃO sóbrio
  private async renderizarPadrao(
    doc: PDFKit.PDFDocument,
    cert: CertificadoPdfInput,
    urlValidacao: string,
    largura: number,
    altura: number,
  ): Promise<void> {
    const margem = 56;
    const w = largura - margem * 2;
    const carga = cert.cargaHoraria ? `${cert.cargaHoraria}h` : '';

    // Moldura sóbria.
    doc.save();
    doc.lineWidth(2).strokeColor('#1f3b57').rect(24, 24, largura - 48, altura - 48).stroke();
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(34).fillColor('#1f3b57')
      .text('CERTIFICADO', margem, 90, { width: w, align: 'center' });

    doc.font('Helvetica').fontSize(13).fillColor('#444')
      .text('Certificamos que', margem, 165, { width: w, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(28).fillColor('#000')
      .text(cert.nomeAluno, margem, 195, { width: w, align: 'center' });

    const conclusao =
      `concluiu o curso ${cert.tituloCurso}` +
      (carga ? ` com carga horária de ${carga}` : '') + '.';
    doc.font('Helvetica').fontSize(14).fillColor('#333')
      .text(conclusao, margem, 250, { width: w, align: 'center' });

    doc.font('Helvetica').fontSize(11).fillColor('#555')
      .text(`Emitido em ${dataBR(cert.emitidoEm)}`, margem, altura - 130, { width: w, align: 'center' });

    // QR + código de validação no rodapé.
    const qr = await QRCode.toBuffer(urlValidacao, { margin: 1, width: 220 });
    const qrSize = 84;
    const qrX = (largura - qrSize) / 2;
    const qrY = altura - 112;
    try {
      doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });
    } catch {
      // ignora QR inválido
    }
    doc.font('Helvetica').fontSize(8.5).fillColor('#666')
      .text(`Código: ${cert.codigo}`, margem, altura - 26, { width: w, align: 'center' });
  }

  // ===================================================== helpers
  /**
   * Substitui os placeholders do template. Identidade (nome/cpf/rg) vem do
   * snapshot do cadastro de cidadão gravado na emissão. {{pagina}}/{{total_paginas}}
   * são resolvidos no loop de páginas.
   * Suportados: {{nome}} {{curso}} {{carga}} {{data}} {{codigo}} {{data_inicio}}
   * {{data_conclusao}} {{conteudo}} {{cpf}} {{rg}} {{pagina}} {{total_paginas}}
   */
  private aplicarPlaceholders(
    texto: string,
    cert: CertificadoPdfInput,
    numeroPagina = 1,
    totalPaginas = 1,
  ): string {
    const carga = cert.cargaHoraria ? `${cert.cargaHoraria}h` : '';
    const rep = (s: string, chave: string, valor: string) =>
      s.replace(new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, 'gi'), valor);
    let out = texto || '';
    out = rep(out, 'nome', cert.nomeAluno);
    out = rep(out, 'curso', cert.tituloCurso);
    out = rep(out, 'carga', carga);
    out = rep(out, 'data', dataBR(cert.emitidoEm));
    out = rep(out, 'codigo', cert.codigo);
    out = rep(out, 'data_inicio', cert.dataInicio ? dataBR(cert.dataInicio) : '');
    out = rep(out, 'data_conclusao', cert.dataConclusao ? dataBR(cert.dataConclusao) : '');
    out = rep(out, 'conteudo', (cert.conteudoProgramatico ?? '').trim());
    out = rep(out, 'cpf', mascararCpf(cert.cpf));
    out = rep(out, 'rg', (cert.rg ?? '').trim());
    out = rep(out, 'pagina', String(numeroPagina));
    out = rep(out, 'total_paginas', String(totalPaginas));
    return out;
  }

  /** Lê imagem do storage (storageKey) ou de URL absoluta; null se ausente/erro. */
  private async carregarImagem(
    storageKey: string | null,
    url: string | null,
  ): Promise<Buffer | null> {
    if (storageKey) {
      try {
        const { buffer } = await this.storage.get(storageKey);
        return buffer;
      } catch {
        return null;
      }
    }
    if (url && /^https?:\/\//i.test(url)) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } catch {
        return null;
      }
    }
    return null;
  }
}
