/**
 * Helpers de calendário para os EVENTOS da secretaria: links "Adicionar à
 * agenda" (Google / Outlook / Apple-iPhone via .ics) e formatação de período
 * no fuso do evento. Funções puras — usáveis em Server Components (SSR).
 *
 * O backend guarda o instante (UTC) + o fuso IANA do evento. Aqui convertemos
 * para o relógio local do evento na exibição e geramos os deep-links.
 */

export interface EventoUnidade {
  nome: string;
  endereco?: string | null;
  cep?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
export interface EventoCal {
  id: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: string; // ISO (UTC)
  fim?: string | null; // ISO (UTC)
  diaInteiro: boolean;
  timezone: string; // IANA
  unidades?: EventoUnidade[];
}

const MS_DIA = 24 * 60 * 60 * 1000;
const MS_HORA = 60 * 60 * 1000;

function partes(iso: string, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(iso))) p[part.type] = part.value;
  return { y: p.year, mo: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, mi: p.minute };
}

/** Valor para <input type="date|datetime-local"> no fuso do evento. */
export function toInputValue(iso: string, tz: string, dateOnly: boolean): string {
  const p = partes(iso, tz);
  return dateOnly ? `${p.y}-${p.mo}-${p.d}` : `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

// ─── formatação de exibição ──────────────────────────────────────────────────

function fmtData(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}
function fmtHora(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Texto humano do período do evento ("10/07/2026, 08:00–17:00"). */
export function formatarPeriodo(ev: EventoCal): string {
  if (ev.diaInteiro) {
    const ini = fmtData(ev.inicio, ev.timezone);
    if (!ev.fim) return ini;
    const fim = fmtData(ev.fim, ev.timezone);
    return ini === fim ? ini : `${ini} a ${fim}`;
  }
  const dataIni = fmtData(ev.inicio, ev.timezone);
  const horaIni = fmtHora(ev.inicio, ev.timezone);
  if (!ev.fim) return `${dataIni}, ${horaIni}`;
  const dataFim = fmtData(ev.fim, ev.timezone);
  const horaFim = fmtHora(ev.fim, ev.timezone);
  if (dataIni === dataFim) return `${dataIni}, ${horaIni}–${horaFim}`;
  return `${dataIni} ${horaIni} a ${dataFim} ${horaFim}`;
}

// ─── deep-links ──────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function basicUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function basicDate(iso: string, tz: string): string {
  const p = partes(iso, tz);
  return `${p.y}${p.mo}${p.d}`;
}

function mapsUrl(u: EventoUnidade): string | null {
  if (u.latitude != null && u.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`;
  }
  if (u.endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco)}`;
  return null;
}

function montarLocal(ev: EventoCal): string {
  const ends = (ev.unidades ?? []).map((u) => u.endereco?.trim()).filter(Boolean) as string[];
  if (ends.length) return ends.join(' | ');
  if (ev.local) return ev.local;
  return (ev.unidades ?? []).map((u) => u.nome).join(', ');
}

function montarDetalhes(ev: EventoCal): string {
  const linhas: string[] = [];
  if (ev.descricao) linhas.push(stripHtml(ev.descricao));
  if (ev.unidades?.length) {
    linhas.push('Locais:');
    for (const u of ev.unidades) {
      const txt = [u.nome, u.endereco].filter(Boolean).join(' — ');
      const link = mapsUrl(u);
      linhas.push(`• ${txt}${link ? ` (${link})` : ''}`);
    }
  } else if (ev.local) {
    linhas.push(`Local: ${ev.local}`);
  }
  return linhas.join('\n');
}

/** Google Agenda (template). */
export function googleCalUrl(ev: EventoCal): string {
  let dates: string;
  if (ev.diaInteiro) {
    const ini = basicDate(ev.inicio, ev.timezone);
    const fimSrc = ev.fim ?? ev.inicio;
    const fim = basicDate(new Date(new Date(fimSrc).getTime() + MS_DIA).toISOString(), ev.timezone);
    dates = `${ini}/${fim}`;
  } else {
    const ini = basicUtc(ev.inicio);
    const fim = basicUtc(ev.fim ?? new Date(new Date(ev.inicio).getTime() + MS_HORA).toISOString());
    dates = `${ini}/${fim}`;
  }
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: ev.titulo, dates, details: montarDetalhes(ev), location: montarLocal(ev),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Outlook / Microsoft (Outlook.com). */
export function outlookCalUrl(ev: EventoCal): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent',
    subject: ev.titulo, body: montarDetalhes(ev), location: montarLocal(ev),
  });
  if (ev.diaInteiro) {
    q.set('allday', 'true');
    q.set('startdt', toInputValue(ev.inicio, ev.timezone, true));
    const fimSrc = ev.fim ?? ev.inicio;
    q.set('enddt', toInputValue(new Date(new Date(fimSrc).getTime() + MS_DIA).toISOString(), ev.timezone, true));
  } else {
    q.set('startdt', new Date(ev.inicio).toISOString());
    q.set('enddt', new Date(ev.fim ?? new Date(new Date(ev.inicio).getTime() + MS_HORA).toISOString()).toISOString());
  }
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

/** Arquivo .ics (Apple/iPhone, Outlook desktop) — servido pela API. */
export function icsUrl(id: string): string {
  return `/api/secretarias/eventos/${id}/ics`;
}
