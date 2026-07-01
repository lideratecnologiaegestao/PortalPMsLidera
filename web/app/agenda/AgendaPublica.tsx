'use client';

/**
 * Agenda pública (calendário read-only). Busca /api/agenda (público, tenant pelo
 * host) e reaproveita o componente de calendário do admin. Botão "assinar .ics".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Calendario from '../admin/agenda/Calendario';
import { corDoItem, tipoLabel, TIPOS_AGENDA, type AgendaItemView } from '../../lib/agenda';

function intervaloGrade(mesRef: Date): { de: string; ate: string } {
  const primeiro = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
  const de = new Date(primeiro);
  de.setDate(1 - primeiro.getDay());
  const ate = new Date(de);
  ate.setDate(de.getDate() + 42);
  return { de: de.toISOString(), ate: ate.toISOString() };
}

export default function AgendaPublica() {
  const [mesRef, setMesRef] = useState(() => new Date());
  const [itens, setItens] = useState<AgendaItemView[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [tiposOcultos, setTiposOcultos] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<AgendaItemView | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const iv = intervaloGrade(mesRef);
      const res = await fetch(`/api/agenda?de=${encodeURIComponent(iv.de)}&ate=${encodeURIComponent(iv.ate)}`, { cache: 'no-store' });
      setItens(res.ok ? await res.json() : []);
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [mesRef]);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => itens.filter((i) => !tiposOcultos.has(i.tipo)), [itens, tiposOcultos]);
  // legenda só com os tipos presentes no mês
  const tiposPresentes = useMemo(() => {
    const set = new Set(itens.map((i) => i.tipo));
    return TIPOS_AGENDA.filter((t) => set.has(t.v));
  }, [itens]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tiposPresentes.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            {tiposPresentes.map((t) => {
              const off = tiposOcultos.has(t.v);
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTiposOcultos((s) => { const n = new Set(s); n.has(t.v) ? n.delete(t.v) : n.add(t.v); return n; })}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${off ? 'opacity-40' : ''}`}
                  style={{ borderColor: t.cor }}
                  aria-pressed={!off}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.cor }} />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        <a
          href="/api/agenda/ics"
          className="rounded border border-border px-3 py-1 text-sm font-semibold hover:bg-muted"
          title="Assinar no Google/Apple/Outlook"
        >
          Assinar (.ics)
        </a>
      </div>

      <Calendario mesRef={mesRef} onMudarMes={setMesRef} itens={visiveis} onSelecionar={setDetalhe} carregando={carregando} />

      {detalhe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetalhe(null)}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-bg p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-start gap-2">
              <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: corDoItem(detalhe) }} />
              <h2 className="font-heading text-lg font-bold text-fg">{detalhe.titulo}</h2>
            </div>
            <div className="space-y-1 text-sm text-fg/80">
              <p><strong>{tipoLabel(detalhe.tipo)}</strong></p>
              <p>{detalhe.diaInteiro ? new Date(detalhe.inicio).toLocaleDateString('pt-BR') : new Date(detalhe.inicio).toLocaleString('pt-BR')}</p>
              {detalhe.local && <p>📍 {detalhe.local}</p>}
              {detalhe.descricao && <p className="whitespace-pre-wrap">{detalhe.descricao}</p>}
              {detalhe.link && <p><a className="text-primary underline" href={detalhe.link}>Mais informações</a></p>}
            </div>
            <div className="mt-4 text-right">
              <button type="button" className="rounded border border-border px-3 py-1 text-sm hover:bg-muted" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
