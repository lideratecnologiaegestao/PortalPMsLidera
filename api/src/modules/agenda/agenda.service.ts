import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AtualizarAgendaItemDto, CriarAgendaItemDto } from './agenda.dto';

/** Fonte de um item no calendário. 'agenda' é editável; 'evento' é read-only (overlay). */
export type FonteAgenda = 'agenda' | 'evento';

/** Item unificado exibido no calendário (agenda própria + overlays). */
export interface AgendaItemView {
  id: string;
  fonte: FonteAgenda;
  editavel: boolean;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  link?: string | null;
  inicio: string; // ISO
  fim?: string | null;
  diaInteiro: boolean;
  cor?: string | null;
  destaque?: boolean;
  // preenchidos só para itens próprios (fonte='agenda') — usados na edição:
  recorrencia?: string;
  publico?: boolean;
  timezone?: string;
}

const TZ_PADRAO = 'America/Cuiaba';

/** Extrai o campo de data em intervalo [de, ate]. Aceita ISO; erro amigável se inválido. */
function parseData(iso: string | undefined, campo: string): Date {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) throw new BadRequestException(`Data inválida: ${campo}`);
  return d;
}

// ── Helpers de fuso (sem dependência externa; usam Intl) ───────────────────
/** Partes civis (ano/mês0/dia/hora/min) de `date` no fuso IANA `tz`. */
function partesNaTz(date: Date, tz: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return { y: +p.year, m: +p.month - 1, d: +p.day, hh: +p.hour % 24, mm: +p.minute };
}
/** Deslocamento (ms) do fuso `tz` no instante `date` (alinhado ao minuto). */
function offsetTzMs(date: Date, tz: string): number {
  const p = partesNaTz(date, tz);
  return Date.UTC(p.y, p.m, p.d, p.hh, p.mm, 0) - date.getTime();
}
/** Instante UTC correspondente à parede (y,m,d,hh,mm) no fuso `tz`. */
function instanteNaTz(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const palpiteMs = Date.UTC(y, m, d, hh, mm, 0);
  return new Date(palpiteMs - offsetTzMs(new Date(palpiteMs), tz));
}
/** Data civil (YYYYMMDD) de `date` no fuso `tz` — p/ eventos de dia inteiro no .ics. */
function dataCivilTz(date: Date, tz: string): string {
  const p = partesNaTz(date, tz);
  return `${p.y}${String(p.m + 1).padStart(2, '0')}${String(p.d).padStart(2, '0')}`;
}

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId(): string {
    const id = TenantContext.tenantId();
    if (!id) throw new BadRequestException('Tenant não resolvido');
    return id;
  }

  // ───────────────────────────────── leitura (calendário) ─────────────────
  /**
   * Lista os itens do calendário no intervalo [de, ate], EXPANDINDO a
   * recorrência anual (feriados/datas comemorativas) e, quando pedido,
   * sobrepondo os eventos das secretarias (read-only).
   */
  async listar(
    deISO: string,
    ateISO: string,
    opts: { admin?: boolean; tipos?: string[]; fontes?: FonteAgenda[] } = {},
  ): Promise<AgendaItemView[]> {
    const de = parseData(deISO, 'de');
    const ate = parseData(ateISO, 'ate');
    if (ate < de) throw new BadRequestException('Intervalo inválido (ate < de).');
    const fontes = opts.fontes ?? ['agenda', 'evento'];
    const out: AgendaItemView[] = [];

    // ── 1) Itens da agenda própria ──────────────────────────────────────────
    if (fontes.includes('agenda')) {
      const baseWhere: any = { ativo: true };
      if (!opts.admin) baseWhere.publico = true;

      // não-recorrentes que tocam o intervalo
      const naoRecorrentes = await this.prisma.db.agendaItem.findMany({
        where: {
          ...baseWhere,
          recorrencia: 'nenhuma',
          inicio: { lte: ate },
          OR: [{ fim: { gte: de } }, { fim: null, inicio: { gte: de } }],
        },
        orderBy: { inicio: 'asc' },
      });
      for (const r of naoRecorrentes) out.push(this.mapAgenda(r));

      // recorrência anual: busca todos e expande por ano no intervalo
      const anuais = await this.prisma.db.agendaItem.findMany({
        where: { ...baseWhere, recorrencia: 'anual' },
      });
      for (const r of anuais) out.push(...this.expandirAnual(r, de, ate));
    }

    // ── Overlay: eventos de secretaria (read-only) ──────────────────────────
    if (fontes.includes('evento')) {
      const eventos = await this.prisma.db.secretariaEvento.findMany({
        where: { ativo: true, inicio: { lte: ate }, OR: [{ fim: { gte: de } }, { fim: null, inicio: { gte: de } }] },
        select: { id: true, titulo: true, inicio: true, fim: true, local: true, diaInteiro: true },
        orderBy: { inicio: 'asc' },
      });
      for (const e of eventos) {
        out.push({
          id: `evento:${e.id}`, fonte: 'evento', editavel: false, tipo: 'evento',
          titulo: e.titulo, local: e.local ?? null, inicio: e.inicio.toISOString(),
          fim: e.fim ? e.fim.toISOString() : null, diaInteiro: !!e.diaInteiro, cor: '#0dcaf0',
          descricao: null, link: null,
        });
      }
    }

    const filtrados = opts.tipos?.length ? out.filter((i) => opts.tipos!.includes(i.tipo)) : out;
    return filtrados.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  /** Próximos N itens (a partir de agora) — para blocos "próximos" na home/admin. */
  async proximos(limite = 5, opts: { admin?: boolean } = {}): Promise<AgendaItemView[]> {
    const agora = new Date();
    const ate = new Date(agora.getTime() + 366 * 24 * 3600 * 1000); // 1 ano à frente
    const todos = await this.listar(agora.toISOString(), ate.toISOString(), opts);
    return todos.filter((i) => new Date(i.fim ?? i.inicio) >= agora).slice(0, Math.max(1, Math.min(50, limite)));
  }

  /**
   * Expande um item recorrente-anual em ocorrências dentro de [de, ate],
   * preservando a PAREDE (hora civil) no fuso do item — assim um feriado à
   * meia-noite de Cuiabá cai sempre no dia civil correto, independentemente do
   * fuso de quem lê. Ocorrências cuja data "rola" (ex.: 29/fev em ano não
   * bissexto vira 01/mar) são puladas. A janela é folgada em ±1 dia para não
   * perder itens exatamente nas bordas da grade.
   */
  private expandirAnual(r: any, de: Date, ate: Date): AgendaItemView[] {
    const tz = r.timezone || TZ_PADRAO;
    const base = new Date(r.inicio);
    const p = partesNaTz(base, tz);
    const durMs = r.fim ? new Date(r.fim).getTime() - base.getTime() : 0;
    const res: AgendaItemView[] = [];
    const folga = 24 * 3600 * 1000;
    for (let y = de.getUTCFullYear() - 1; y <= ate.getUTCFullYear() + 1; y++) {
      const ini = instanteNaTz(y, p.m, p.d, p.hh, p.mm, tz);
      const c = partesNaTz(ini, tz);
      if (c.m !== p.m || c.d !== p.d) continue; // 29/fev em ano não bissexto → pula
      if (ini.getTime() < de.getTime() - folga || ini.getTime() > ate.getTime() + folga) continue;
      const fim = durMs > 0 ? new Date(ini.getTime() + durMs) : null;
      res.push({
        ...this.mapAgenda(r),
        id: `${r.id}:${y}`, // ocorrência única por ano
        inicio: ini.toISOString(),
        fim: fim ? fim.toISOString() : null,
      });
    }
    return res;
  }

  private mapAgenda(r: any): AgendaItemView {
    return {
      id: r.id, fonte: 'agenda', editavel: true, tipo: r.tipo, titulo: r.titulo,
      descricao: r.descricao ?? null, local: r.local ?? null, link: r.link ?? null,
      inicio: new Date(r.inicio).toISOString(), fim: r.fim ? new Date(r.fim).toISOString() : null,
      diaInteiro: r.diaInteiro, cor: r.cor ?? null, destaque: r.destaque,
      recorrencia: r.recorrencia, publico: r.publico, timezone: r.timezone,
    };
  }

  // ───────────────────────────────── CRUD (admin) ─────────────────────────
  listarAdmin(de: string, ate: string, tipos?: string[]) {
    return this.listar(de, ate, { admin: true, tipos });
  }

  /** Itens brutos da agenda própria (para a lista de gestão, sem overlay/expansão). */
  listarItens() {
    return this.prisma.db.agendaItem.findMany({ orderBy: { inicio: 'desc' } });
  }

  async criar(dto: CriarAgendaItemDto) {
    const inicio = parseData(dto.inicio, 'inicio');
    const fim = dto.fim ? parseData(dto.fim, 'fim') : null;
    if (fim && fim < inicio) throw new BadRequestException('Fim antes do início.');
    return this.prisma.db.agendaItem.create({
      data: {
        tenantId: this.tenantId(),
        tipo: dto.tipo || 'evento',
        titulo: dto.titulo.trim(),
        descricao: dto.descricao?.trim() || null,
        local: dto.local?.trim() || null,
        link: dto.link?.trim() || null,
        inicio, fim,
        diaInteiro: dto.diaInteiro ?? false,
        timezone: dto.timezone || TZ_PADRAO,
        cor: dto.cor?.trim() || null,
        recorrencia: dto.recorrencia === 'anual' ? 'anual' : 'nenhuma',
        destaque: dto.destaque ?? false,
        publico: dto.publico ?? true,
        ativo: dto.ativo ?? true,
        ordem: dto.ordem ?? 0,
      } as any,
    });
  }

  async atualizar(id: string, dto: AtualizarAgendaItemDto) {
    const atual = await this.prisma.db.agendaItem.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Item não encontrado.');
    const data: any = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.tipo !== undefined) data.tipo = dto.tipo || 'evento';
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim() || null;
    if (dto.local !== undefined) data.local = dto.local.trim() || null;
    if (dto.link !== undefined) data.link = dto.link.trim() || null;
    if (dto.inicio !== undefined) data.inicio = parseData(dto.inicio, 'inicio');
    if (dto.fim !== undefined) data.fim = dto.fim ? parseData(dto.fim, 'fim') : null;
    if (dto.diaInteiro !== undefined) data.diaInteiro = dto.diaInteiro;
    if (dto.timezone !== undefined) data.timezone = dto.timezone || TZ_PADRAO;
    if (dto.cor !== undefined) data.cor = dto.cor.trim() || null;
    if (dto.recorrencia !== undefined) data.recorrencia = dto.recorrencia === 'anual' ? 'anual' : 'nenhuma';
    if (dto.destaque !== undefined) data.destaque = dto.destaque;
    if (dto.publico !== undefined) data.publico = dto.publico;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    return this.prisma.db.agendaItem.update({ where: { id }, data });
  }

  async excluir(id: string) {
    const atual = await this.prisma.db.agendaItem.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Item não encontrado.');
    await this.prisma.db.agendaItem.delete({ where: { id } });
    return { removido: true };
  }

  // ───────────────────────────────── .ics (assinar no calendário) ─────────
  /** Feed iCalendar do período (agenda pública + overlays). */
  async ics(deISO: string, ateISO: string): Promise<string> {
    const itens = await this.listar(deISO, ateISO, { admin: false });
    const linhas = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lidera//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ];
    const dt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const carimbo = dt(new Date().toISOString()); // DTSTAMP exigido pelo RFC 5545
    for (const it of itens) {
      const tz = it.timezone || TZ_PADRAO;
      linhas.push('BEGIN:VEVENT');
      linhas.push(`UID:${it.id}@lidera.app.br`);
      linhas.push(`DTSTAMP:${carimbo}`);
      if (it.diaInteiro) {
        // Dia inteiro: DATE flutuante (civil). DTEND é EXCLUSIVO → dia seguinte ao fim.
        const fimBase = it.fim ? new Date(it.fim) : new Date(it.inicio);
        const fp = partesNaTz(fimBase, tz);
        const prox = new Date(Date.UTC(fp.y, fp.m, fp.d) + 24 * 3600 * 1000);
        const proxStr = `${prox.getUTCFullYear()}${String(prox.getUTCMonth() + 1).padStart(2, '0')}${String(prox.getUTCDate()).padStart(2, '0')}`;
        linhas.push(`DTSTART;VALUE=DATE:${dataCivilTz(new Date(it.inicio), tz)}`);
        linhas.push(`DTEND;VALUE=DATE:${proxStr}`);
      } else {
        linhas.push(`DTSTART:${dt(it.inicio)}`);
        if (it.fim) linhas.push(`DTEND:${dt(it.fim)}`);
      }
      linhas.push(`SUMMARY:${escaparIcs(it.titulo)}`);
      if (it.local) linhas.push(`LOCATION:${escaparIcs(it.local)}`);
      if (it.descricao) linhas.push(`DESCRIPTION:${escaparIcs(it.descricao)}`);
      linhas.push('END:VEVENT');
    }
    linhas.push('END:VCALENDAR');
    return linhas.join('\r\n');
  }
}

/** Escapa vírgula/ponto-e-vírgula/quebra p/ o formato iCalendar. */
function escaparIcs(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
