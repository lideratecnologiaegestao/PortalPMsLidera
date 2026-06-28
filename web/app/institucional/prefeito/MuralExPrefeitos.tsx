'use client';

import { useEffect, useState } from 'react';
import type { Prefeito } from '../../../lib/portal-api';
import { mandatoTexto } from './mandato';

function Iniciais({ nome }: { nome: string }) {
  const i = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return <span aria-hidden="true">{i}</span>;
}

/**
 * Mural de ex-prefeitos: grade de fotos com nome e mandato. Ao clicar, abre um
 * modal com a foto, o mandato e a breve história.
 */
export default function MuralExPrefeitos({ lista }: { lista: Prefeito[] }) {
  const [sel, setSel] = useState<Prefeito | null>(null);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    document.addEventListener('keydown', onKey);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = anterior; };
  }, [sel]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {lista.map((p) => {
          const mandato = mandatoTexto(p);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSel(p)}
                className="group w-full overflow-hidden rounded-xl border border-border bg-bg text-left shadow-sm transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`Ver história de ${p.nome}`}
              >
                <div className="aspect-[3/4] w-full bg-muted">
                  {p.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.fotoUrl} alt={`Foto de ${p.nome}`} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-primary/40"><Iniciais nome={p.nome} /></div>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-heading text-sm font-bold text-fg">{p.nome}</p>
                  {mandato && <p className="text-xs text-fg/60">{mandato}</p>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {sel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`História de ${sel.nome}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSel(null)}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4 border-b border-border p-5">
              <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                {sel.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sel.fotoUrl} alt={`Foto de ${sel.nome}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary/40"><Iniciais nome={sel.nome} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-xl font-bold text-fg">{sel.nome}</h3>
                {mandatoTexto(sel) && <p className="text-sm font-semibold text-primary">Mandato {mandatoTexto(sel)}</p>}
                {sel.partido && <p className="text-sm text-fg/60">{sel.partido}</p>}
                {sel.resumo && <p className="mt-1 text-sm text-fg/75">{sel.resumo}</p>}
              </div>
              <button type="button" onClick={() => setSel(null)} className="shrink-0 rounded p-1 text-2xl leading-none text-fg/50 hover:text-fg" aria-label="Fechar">×</button>
            </div>
            <div className="p-5">
              {sel.historia ? (
                <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: sel.historia }} />
              ) : (
                <p className="text-sm text-fg/60">História não cadastrada.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
