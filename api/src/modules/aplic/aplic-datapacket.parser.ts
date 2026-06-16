import { XMLParser } from 'fast-xml-parser';

/**
 * Parser dos XMLs da carga APLIC (TCE-MT). Cada tabela do leiaute é um
 * DATAPACKET (Delphi ClientDataSet), encoding ISO-8859-1:
 *   <DATAPACKET><METADATA><FIELDS><FIELD attrname width fieldtype/></FIELDS></METADATA>
 *   <ROWDATA><ROW attr="valor".../></ROWDATA></DATAPACKET>
 * O formato é autodescritivo, então UM parser serve a todas as tabelas/módulos.
 * Validado em dado real (CM Alto Garças, CT 2026/01).
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false, // mantém tudo string (códigos "01", valores "1234.69")
  trimValues: false,
});

export interface DatapacketParsed {
  fields: string[];
  rows: Record<string, string>[];
}

/** Faz o parse de um buffer de XML DATAPACKET (ISO-8859-1) em {fields, rows}. */
export function parseDatapacket(buf: Buffer): DatapacketParsed {
  const xml = buf.toString('latin1'); // ISO-8859-1 (acentos)
  const doc = parser.parse(xml) as {
    DATAPACKET?: {
      METADATA?: { FIELDS?: { FIELD?: unknown } };
      ROWDATA?: { ROW?: unknown };
    };
  };
  const dp = doc.DATAPACKET ?? {};
  const fieldsRaw = dp.METADATA?.FIELDS?.FIELD ?? [];
  const fields = asArray(fieldsRaw)
    .map((f) => (f as { attrname?: string }).attrname)
    .filter((n): n is string => !!n);
  const rows = asArray(dp.ROWDATA?.ROW ?? []) as Record<string, string>[];
  return { fields, rows };
}

function asArray<T>(v: T | T[]): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Converte um valor monetário APLIC (string) em número.
 * Real usa ponto decimal sem separador de milhar ("13332.69"); o parser também
 * tolera o formato pt-BR ("13.332,69") por robustez.
 */
export function parseValorAplic(s: string | undefined | null): number {
  if (s == null || s === '') return 0;
  let t = String(s).trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte uma data APLIC "dd/mm/aaaa" em Date (UTC, meia-noite). Retorna null
 * se vazia/inválida. Usa UTC para evitar deslize de fuso ao gravar em `date`.
 */
export function parseDataAplic(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Extrai o ano (exercício) de um número APLIC no formato "NNN/AAAA". */
export function exercicioDeNumero(numero: string | undefined | null): number | null {
  if (!numero) return null;
  const m = String(numero).match(/\/(\d{4})$/);
  return m ? Number(m[1]) : null;
}

/** Vazio→null (atributo ausente ou string vazia do DATAPACKET). */
export function nuloSeVazio(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = String(s);
  return t === '' ? null : t;
}
