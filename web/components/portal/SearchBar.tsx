'use client';

/**
 * Barra de busca do portal. Client Component para interatividade.
 * Submit navega para /busca?q=<termo>.
 * Tokens: border-border, bg-muted, text-fg, bg-primary, text-primary-fg.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBar() {
  const [q, setQ] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/busca?q=${encodeURIComponent(term)}`);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex w-full items-stretch"
      aria-label="Buscar no portal"
    >
      <label htmlFor="site-search" className="sr-only">
        O que deseja encontrar?
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="O que deseja encontrar?"
        autoComplete="off"
        className="w-full rounded-l border border-border bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="Campo de busca"
      />
      <button
        type="submit"
        aria-label="Pesquisar"
        className="flex items-center gap-1.5 rounded-r bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      >
        <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
        </svg>
        <span className="hidden sm:inline">Buscar</span>
      </button>
    </form>
  );
}
