'use client';

/**
 * Calendário mensal (grade 7×6), sem dependência externa. Agrupa os itens pelo
 * DIA CIVIL no fuso da instituição (não no fuso do navegador) e os renderiza
 * como chips coloridos — assim um item de fim de noite ou um feriado de meia-
 * noite cai sempre no dia correto para qualquer visitante. Reutilizável no
 * admin e no público. A navegação de mês é controlada pelo pai.
 */

import { useMemo } from 'react';
import type { AgendaItemView } from '../../../lib/agenda';
import { corDoItem } from '../../../lib/agenda';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
/** Fuso padrão da instituição (Mato Grosso). Itens carregam o seu próprio. */
const TZ_INST = 'America/Cuiaba';

/** Chave YYYY-MM-DD do instante `iso` no fuso `tz` (civil, não do navegador). */
function chaveDia(iso: string, tz: string = TZ_INST): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}
/** Hora HH:MM do instante `iso` no fuso `tz`. */
function horaBR(iso: string, tz: string = TZ_INST): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

interface Props {
  /** Data de referência (qualquer dia do mês exibido). */
  mesRef: Date;
  onMudarMes: (novo: Date) => void;
  itens: AgendaItemView[];
  onSelecionar: (item: AgendaItemView) => void;
  /** Clique num dia (ex.: criar item naquela data). Opcional. */
  onNovoNoDia?: (data: Date) => void;
  carregando?: boolean;
}

export default function Calendario({ mesRef, onMudarMes, itens, onSelecionar, onNovoNoDia, carregando }: Props) {
  const ano = mesRef.getFullYear();
  const mes = mesRef.getMonth();

  // 42 células (dias civis) a partir do domingo da 1ª semana. A chave é montada
  // dos componentes civis (independe do fuso do navegador).
  const celulas = useMemo(() => {
    const desloc = new Date(ano, mes, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(ano, mes, 1 - desloc + i);
      const y = d.getFullYear(), mm = d.getMonth(), dd = d.getDate();
      return {
        chave: `${y}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        num: dd,
        noMes: mm === mes,
        data: d,
      };
    });
  }, [ano, mes]);

  // Agrupa itens pelo dia civil no fuso do próprio item.
  const porDia = useMemo(() => {
    const m = new Map<string, AgendaItemView[]>();
    for (const it of itens) {
      const k = chaveDia(it.inicio, it.timezone || TZ_INST);
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return m;
  }, [itens]);

  const hojeK = chaveDia(new Date().toISOString());

  return (
    <div>
      {/* Cabeçalho de navegação */}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onMudarMes(new Date(ano, mes - 1, 1))}
          aria-label="Mês anterior"
        >
          ◀
        </button>
        <h2 className="min-w-[11rem] text-center font-heading text-lg font-bold">
          {MESES[mes]} {ano}
        </h2>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onMudarMes(new Date(ano, mes + 1, 1))}
          aria-label="Próximo mês"
        >
          ▶
        </button>
        <button
          type="button"
          className="ml-2 rounded border border-border px-2 py-1 text-sm hover:bg-muted"
          onClick={() => onMudarMes(new Date())}
        >
          Hoje
        </button>
        {carregando && <span className="ml-2 text-sm text-fg/50" aria-live="polite">carregando…</span>}
      </div>

      {/* Grade */}
      <div className="overflow-hidden rounded border border-border">
        <div className="grid grid-cols-7 bg-muted text-center text-xs font-semibold text-fg/70">
          {SEMANA.map((s) => (
            <div key={s} className="py-1">{s}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celulas.map((c, i) => {
            const k = c.chave;
            const doMes = c.noMes;
            const eHoje = k === hojeK;
            const dia = porDia.get(k) ?? [];
            return (
              <div
                key={i}
                className={[
                  'min-h-[92px] border-b border-r border-border p-1 align-top',
                  doMes ? 'bg-bg' : 'bg-muted/30 text-fg/40',
                  onNovoNoDia ? 'cursor-pointer hover:bg-muted/40' : '',
                ].join(' ')}
                onClick={onNovoNoDia ? () => onNovoNoDia(c.data) : undefined}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={[
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                      eHoje ? 'bg-primary font-bold text-primary-fg' : 'text-fg/70',
                    ].join(' ')}
                  >
                    {c.num}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dia.slice(0, 4).map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelecionar(it); }}
                      title={`${it.diaInteiro ? '' : horaBR(it.inicio, it.timezone || TZ_INST) + ' '}${it.titulo}`}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:opacity-80"
                      style={{ backgroundColor: corDoItem(it) + '22', borderLeft: `3px solid ${corDoItem(it)}` }}
                    >
                      {!it.diaInteiro && <span className="shrink-0 tabular-nums text-fg/60">{horaBR(it.inicio, it.timezone || TZ_INST)}</span>}
                      <span className="truncate text-fg">{it.titulo}</span>
                    </button>
                  ))}
                  {dia.length > 4 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelecionar(dia[4]); }}
                      className="px-1 text-[11px] text-fg/50 hover:underline"
                    >
                      +{dia.length - 4} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
