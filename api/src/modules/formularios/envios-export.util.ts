/**
 * Utilitários de exportação dos envios de formulário.
 * Suporta CSV (separador ; + BOM), XML estruturado e XLSX (SpreadsheetML 2003).
 * Nenhuma dependência externa nova — XLSX via SpreadsheetML puro.
 */
import type { Response } from 'express';
import { CampoSchema } from './formularios.types';
import { enviarExport } from '../../common/export/export.util';

// ----------------------------------------------------------------- helpers

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function csvCampo(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  s = s.replace(/"/g, '""');
  return /[";\n\r]/.test(s) ? `"${s}"` : s;
}

// ----------------------------------------------------------------- tipos internos

interface LinhaEnvio {
  dados: Record<string, unknown>;
  criadoEm: Date;
}

// ----------------------------------------------------------------- CSV

export function exportarCsv(
  res: Response,
  slug: string,
  campos: CampoSchema[],
  envios: LinhaEnvio[],
): void {
  const cols = [
    ...campos
      .filter((c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo')
      .map((c) => ({ key: c.nome, label: c.label })),
    { key: '__criadoEm', label: 'Enviado em' },
  ];

  const rows = envios.map((e) => ({
    ...e.dados,
    __criadoEm: e.criadoEm.toISOString(),
  }));

  enviarExport(res, 'csv', `formulario-${slug}-envios`, rows as Record<string, unknown>[], cols);
}

// ----------------------------------------------------------------- XML

export function exportarXml(
  res: Response,
  slug: string,
  campos: CampoSchema[],
  envios: LinhaEnvio[],
): void {
  const camposAtivos = campos.filter((c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<envios>\n';
  for (const envio of envios) {
    xml += '  <envio>\n';
    for (const campo of camposAtivos) {
      const v = envio.dados[campo.nome];
      const valor =
        v == null
          ? ''
          : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
      xml += `    <campo nome="${escapeXml(campo.nome)}" label="${escapeXml(campo.label)}">${escapeXml(valor)}</campo>\n`;
    }
    xml += `    <campo nome="criadoEm" label="Enviado em">${escapeXml(envio.criadoEm.toISOString())}</campo>\n`;
    xml += '  </envio>\n';
  }
  xml += '</envios>';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="formulario-${slug}-envios.xml"`);
  res.send(xml);
}

// ----------------------------------------------------------------- XLSX (SpreadsheetML 2003)

/**
 * Gera um arquivo XLSX via SpreadsheetML 2003 (XML puro, sem dependência nova).
 * Servido como application/vnd.ms-excel com extensão .xls — abre no Excel/LibreOffice.
 */
export function exportarXlsx(
  res: Response,
  slug: string,
  campos: CampoSchema[],
  envios: LinhaEnvio[],
): void {
  const camposAtivos = campos.filter((c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo');
  const headers = [...camposAtivos.map((c) => c.label), 'Enviado em'];

  function cell(v: unknown, isHeader = false): string {
    const val =
      v == null
        ? ''
        : v instanceof Date
        ? v.toISOString()
        : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
    const escaped = escapeXml(val);
    const style = isHeader ? ' ss:StyleID="cabecalho"' : '';
    return `<Cell${style}><Data ss:Type="String">${escaped}</Data></Cell>`;
  }

  const headerRow = `<Row>${headers.map((h) => cell(h, true)).join('')}</Row>`;
  const dataRows = envios
    .map((envio) => {
      const cells = [
        ...camposAtivos.map((c) => {
          const v = envio.dados[c.nome];
          return cell(v);
        }),
        cell(envio.criadoEm.toISOString()),
      ];
      return `<Row>${cells.join('')}</Row>`;
    })
    .join('\n');

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>
    <Style ss:ID="cabecalho">
      <Font ss:Bold="1"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Envios">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;

  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="formulario-${slug}-envios.xls"`,
  );
  res.send(workbook);
}
