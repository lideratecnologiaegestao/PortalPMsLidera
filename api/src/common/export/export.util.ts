import { Response } from 'express';

export interface ColunaExport {
  key: string;
  label: string;
}

function csvCampo(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString().slice(0, 10);
  else s = String(v);
  s = s.replace(/"/g, '""');
  return /[";\n\r]/.test(s) ? `"${s}"` : s;
}

/**
 * Envia uma listagem como CSV (padrão; separador `;` + BOM para o Excel pt-BR)
 * ou JSON, com cabeçalho de download. Dados abertos das listagens públicas
 * (PNTP) — sem PII, só metadados.
 */
export function enviarExport(
  res: Response,
  formato: string | undefined,
  nome: string,
  rows: Record<string, unknown>[],
  cols: ColunaExport[],
): void {
  if ((formato ?? 'csv').toLowerCase() === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.json"`);
    res.send(JSON.stringify(rows, null, 2));
    return;
  }
  const cabecalho = cols.map((c) => csvCampo(c.label)).join(';');
  const corpo = rows.map((r) => cols.map((c) => csvCampo(r[c.key])).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  const bom = String.fromCharCode(0xfeff);
  res.send(bom + cabecalho + '\r\n' + corpo);
}
