import PDFDocument from 'pdfkit';
import type { RelatorioUsuarios } from './users-relatorio.service';

/** Gera o PDF do relatório consolidado de usuários. */
export async function relatorioUsuariosPdf(
  d: RelatorioUsuarios,
  municipio: string,
  logoBuffer?: Buffer | null,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const fim = new Promise<void>((r) => doc.on('end', () => r()));

  const L = doc.page.margins.left;
  const largura = doc.page.width - L - doc.page.margins.right;

  // Cabeçalho
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, L, doc.y, { width: 90 });
      doc.moveDown(0.5);
    } catch {
      // logo corrompido ou formato inesperado — continua sem imagem
    }
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000')
    .text(`Relatório de Usuários — ${municipio}`, { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#555')
    .text(`Gerado em ${new Date(d.geradoEm).toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown();

  // Resumo
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Resumo'); doc.moveDown(0.3);
  const lin = (rot: string, v: number | string) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(`${rot}: `, { continued: true });
    doc.font('Helvetica').text(String(v));
  };
  lin('Total de usuários', d.resumo.total);
  lin('Ativos', d.resumo.ativos);
  lin('Inativos', d.resumo.inativos);
  lin('Com MFA habilitado', d.resumo.comMfa);
  lin('Online agora', d.resumo.onlineAgora);
  doc.moveDown(0.6);

  // Por papel
  if (d.resumo.porPapel.length) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Por papel'); doc.moveDown(0.2);
    for (const p of d.resumo.porPapel) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(p.papel, L, y, { width: largura - 60 });
      doc.text(String(p.total), L, y, { width: largura, align: 'right' });
    }
    doc.moveDown(0.6);
  }

  // Por grupo
  if (d.resumo.porGrupo.length) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Por grupo'); doc.moveDown(0.2);
    for (const g of d.resumo.porGrupo) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor('#222').text(g.grupo, L, y, { width: largura - 60 });
      doc.text(String(g.membros), L, y, { width: largura, align: 'right' });
    }
    doc.moveDown(0.6);
  }

  // Últimos acessos
  if (d.ultimosAcessos.length) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Últimos acessos (top 50)'); doc.moveDown(0.2);
    for (const u of d.ultimosAcessos) {
      doc.font('Helvetica').fontSize(9).fillColor('#222')
        .text(
          `${u.nome} (${u.email}) — ${u.papel} — ${u.ultimoLoginEm ? new Date(u.ultimoLoginEm).toLocaleString('pt-BR') : 'nunca'}`,
          { width: largura },
        );
    }
    doc.moveDown(0.6);
  }

  // Logins recentes
  if (d.logins.length) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Logins recentes'); doc.moveDown(0.2);
    for (const l of d.logins) {
      doc.font('Helvetica').fontSize(9).fillColor('#222')
        .text(
          `${new Date(l.data).toLocaleString('pt-BR')} — ${l.acao}${l.nomeAtor ? ` — ${l.nomeAtor}` : ''}${l.email ? ` <${l.email}>` : ''}`,
          { width: largura },
        );
    }
  }

  doc.end();
  await fim;
  return Buffer.concat(chunks);
}
