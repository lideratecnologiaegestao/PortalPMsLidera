'use client';

import { useMemo, useState } from 'react';

export interface MapaLink { label: string; href: string; externo?: boolean }
export interface MapaSecao { titulo: string; links: MapaLink[] }

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function MapaCliente({ secoes }: { secoes: MapaSecao[] }) {
  const [busca, setBusca] = useState('');

  const totalLinks = useMemo(() => secoes.reduce((n, s) => n + s.links.length, 0), [secoes]);

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return secoes;
    return secoes
      .map((s) => {
        // Se o título da seção casa, mantém todos os links dela.
        if (norm(s.titulo).includes(q)) return s;
        const links = s.links.filter((l) => norm(l.label).includes(q) || norm(l.href).includes(q));
        return { ...s, links };
      })
      .filter((s) => s.links.length > 0);
  }, [secoes, busca]);

  const totalFiltrado = filtradas.reduce((n, s) => n + s.links.length, 0);

  return (
    <div className="space-y-5">
      {/* Busca */}
      <div className="relative max-w-md">
        <label htmlFor="mapa-busca" className="sr-only">Filtrar o mapa do site</label>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg/40">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </span>
        <input
          id="mapa-busca"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar uma página, serviço, secretaria…"
          className="w-full rounded border border-border bg-bg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <p className="text-xs text-fg/50" aria-live="polite">
        {busca ? `${totalFiltrado} de ${totalLinks} links` : `${totalLinks} links em ${secoes.length} seções`}
      </p>

      {/* Mapa em colunas (masonry) */}
      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg/60">Nenhum resultado para “{busca}”.</p>
      ) : (
        <div className="gap-5 [column-fill:_balance] sm:columns-2 lg:columns-3">
          {filtradas.map((s) => (
            <section key={s.titulo} className="mb-5 break-inside-avoid rounded border border-border bg-bg p-4">
              <h2 className="mb-2 border-b border-border pb-1 font-heading text-sm font-bold uppercase tracking-wide text-primary">
                {s.titulo}
              </h2>
              <ul className="space-y-1.5">
                {s.links.map((l, i) => (
                  <li key={`${l.href}-${i}`}>
                    <a
                      href={l.href}
                      {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="text-sm text-fg/80 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                    >
                      {l.label}
                      {l.externo && <span aria-hidden="true" className="ml-0.5 text-fg/40">↗</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
