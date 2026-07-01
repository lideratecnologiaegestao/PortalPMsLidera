/**
 * Utilidades de data/fuso e geração de .ics para os EVENTOS da secretaria.
 *
 * Estratégia de fuso: o admin digita a hora local (no fuso do município). O
 * backend converte para o INSTANTE absoluto (UTC) usando o IANA timezone do
 * evento e guarda em timestamptz. Para exibição e .ics convertemos de volta.
 * .ics/Google/Outlook saem em UTC (sufixo Z) — apps de calendário mostram no
 * fuso de quem abre, o que para um evento municipal é o resultado correto.
 */

/** Offset (ms) do fuso `tz` no instante `at` — positivo a leste de Greenwich. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  // 'hour' pode vir '24' em alguns engines — normaliza para 0.
  const hora = p.hour === '24' ? '00' : p.hour;
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +hora, +p.minute, +p.second);
  return comoUtc - at.getTime();
}

/**
 * Interpreta um relógio de parede local (`"YYYY-MM-DD"` ou `"YYYY-MM-DDTHH:mm"`)
 * como sendo no fuso `tz` e retorna o instante UTC correspondente.
 */
export function zonedToUtc(local: string, tz: string): Date {
  const [dataParte, horaParte = '00:00'] = local.trim().split('T');
  const [y, mo, d] = dataParte.split('-').map(Number);
  const [h = 0, mi = 0] = horaParte.split(':').map(Number);
  // Palpite: trata os componentes como se fossem UTC.
  const palpite = Date.UTC(y, (mo || 1) - 1, d || 1, h, mi, 0);
  // O offset do fuso naquele instante corrige o palpite.
  const offset = tzOffsetMs(tz, new Date(palpite));
  return new Date(palpite - offset);
}

/** Componentes de data/hora de um instante já no fuso `tz`. */
export function partesNoFuso(at: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return { y: p.year, mo: p.month, d: p.day, h: hour, mi: p.minute, s: p.second };
}

// ─── .ics ────────────────────────────────────────────────────────────────────

/** Carimbo UTC no formato iCalendar básico: 20260710T120000Z */
function fmtUtc(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
/** Data (sem hora) no fuso do evento: 20260710 — para eventos de dia inteiro. */
function fmtDataNoFuso(at: Date, tz: string): string {
  const p = partesNoFuso(at, tz);
  return `${p.y}${p.mo}${p.d}`;
}
/** Escapa texto para um valor de propriedade iCalendar (RFC 5545). */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** Dobra linhas com mais de 75 octetos (continuação com espaço). */
function fold(linha: string): string {
  if (linha.length <= 73) return linha;
  const partes: string[] = [];
  let resto = linha;
  partes.push(resto.slice(0, 73));
  resto = resto.slice(73);
  while (resto.length > 72) { partes.push(' ' + resto.slice(0, 72)); resto = resto.slice(72); }
  if (resto.length) partes.push(' ' + resto);
  return partes.join('\r\n');
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface UnidadeEvento {
  nome: string;
  endereco?: string | null;
  cep?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface EventoIcs {
  id: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: Date;
  fim?: Date | null;
  diaInteiro: boolean;
  timezone: string;
  secretariaNome: string;
  url?: string | null;
  unidades: UnidadeEvento[];
}

function mapsUrl(u: UnidadeEvento): string | null {
  if (u.latitude != null && u.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`;
  }
  if (u.endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco)}`;
  return null;
}

/** Gera o conteúdo de um arquivo .ics (VCALENDAR com 1 VEVENT). */
export function gerarIcs(ev: EventoIcs, agora: Date): string {
  const linhas: string[] = [];
  const add = (l: string) => linhas.push(fold(l));

  // LOCATION: endereços das unidades (ou o texto livre `local`).
  const enderecos = ev.unidades.map((u) => u.endereco?.trim()).filter(Boolean) as string[];
  const location = enderecos.length ? enderecos.join(' | ') : (ev.local || ev.unidades.map((u) => u.nome).join(', '));

  // DESCRIPTION: descrição + locais com link de mapa.
  const blocos: string[] = [];
  if (ev.descricao) blocos.push(stripHtml(ev.descricao));
  if (ev.unidades.length) {
    blocos.push('Locais:');
    for (const u of ev.unidades) {
      const partes = [u.nome, u.endereco].filter(Boolean).join(' — ');
      const link = mapsUrl(u);
      blocos.push(`• ${partes}${link ? ` (${link})` : ''}`);
    }
  } else if (ev.local) {
    blocos.push(`Local: ${ev.local}`);
  }
  blocos.push(`Organização: ${ev.secretariaNome}`);
  const description = blocos.join('\n');

  const geo = ev.unidades.find((u) => u.latitude != null && u.longitude != null);

  add('BEGIN:VCALENDAR');
  add('VERSION:2.0');
  add('PRODID:-//Portal Prefeitura//Eventos//PT-BR');
  add('CALSCALE:GREGORIAN');
  add('METHOD:PUBLISH');
  add('BEGIN:VEVENT');
  add(`UID:evento-${ev.id}@portal-prefeitura`);
  add(`DTSTAMP:${fmtUtc(agora)}`);
  if (ev.diaInteiro) {
    add(`DTSTART;VALUE=DATE:${fmtDataNoFuso(ev.inicio, ev.timezone)}`);
    // DTEND de dia inteiro é EXCLUSIVO → dia seguinte ao fim (ou ao início).
    const fimBase = ev.fim ?? ev.inicio;
    const seguinte = new Date(fimBase.getTime() + 24 * 60 * 60 * 1000);
    add(`DTEND;VALUE=DATE:${fmtDataNoFuso(seguinte, ev.timezone)}`);
  } else {
    add(`DTSTART:${fmtUtc(ev.inicio)}`);
    const fim = ev.fim ?? new Date(ev.inicio.getTime() + 60 * 60 * 1000);
    add(`DTEND:${fmtUtc(fim)}`);
  }
  add(`SUMMARY:${esc(ev.titulo)}`);
  if (description) add(`DESCRIPTION:${esc(description)}`);
  if (location) add(`LOCATION:${esc(location)}`);
  if (geo) add(`GEO:${geo.latitude};${geo.longitude}`);
  if (ev.url) add(`URL:${esc(ev.url)}`);
  add('END:VEVENT');
  add('END:VCALENDAR');
  return linhas.join('\r\n') + '\r\n';
}
