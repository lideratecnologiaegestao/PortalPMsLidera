'use client';

/**
 * Filtro de notícias por categoria e busca textual.
 * Client Component para interação com formulários.
 * Tokens: border-border, bg-muted, text-fg, bg-primary, text-primary-fg.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CATEGORIAS = [
  'Saúde',
  'Educação',
  'Infraestrutura',
  'Meio Ambiente',
  'Social',
  'Finanças',
  'Cultura',
  'Esportes',
  'Segurança',
  'Outros',
];

interface Props {
  categoriaAtiva?: string;
  buscaAtiva?: string;
}

export default function FiltroNoticias({ categoriaAtiva, buscaAtiva }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(buscaAtiva ?? '');

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (categoriaAtiva) sp.set('categoria', categoriaAtiva);
    router.push(`/noticias?${sp.toString()}`);
  }

  function setCategoria(cat: string | undefined) {
    const sp = new URLSearchParams();
    if (cat) sp.set('categoria', cat);
    if (q.trim()) sp.set('q', q.trim());
    router.push(`/noticias?${sp.toString()}`);
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Busca */}
      <form onSubmit={applySearch} role="search" className="flex gap-2" aria-label="Buscar nas notícias">
        <label htmlFor="noticias-q" className="sr-only">Buscar notícias</label>
        <input
          id="noticias-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar notícias..."
          className="flex-1 rounded border border-border bg-muted/50 px-3 py-2 text-sm text-fg placeholder:text-fg/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          Buscar
        </button>
      </form>

      {/* Categorias */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
        <button
          type="button"
          onClick={() => setCategoria(undefined)}
          aria-pressed={!categoriaAtiva}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            !categoriaAtiva
              ? 'bg-primary text-primary-fg'
              : 'border border-border text-fg hover:bg-muted'
          }`}
        >
          Todas
        </button>
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoria(cat === categoriaAtiva ? undefined : cat)}
            aria-pressed={categoriaAtiva === cat}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              categoriaAtiva === cat
                ? 'bg-primary text-primary-fg'
                : 'border border-border text-fg hover:bg-muted'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}
