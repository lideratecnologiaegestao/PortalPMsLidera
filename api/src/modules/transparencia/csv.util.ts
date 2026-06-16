/**
 * Serializa um array de objetos em CSV (dados abertos). Defende contra CSV
 * injection: células que começam com = + - @ recebem um apóstrofo na frente
 * (recomendação OWASP), pois planilhas interpretam isso como fórmula.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? String(value) : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return (columns ?? []).join(';') + '\n';
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.join(';');
  const body = rows
    .map((r) => cols.map((c) => escapeCell(r[c])).join(';'))
    .join('\n');
  return `${header}\n${body}\n`;
}
