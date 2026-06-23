/**
 * Página de fallback offline — servida pelo service worker quando o cidadão
 * tenta navegar sem conexão e a página solicitada não está em cache.
 *
 * Renderizada dentro do shell do portal público (layout.tsx), portanto herda
 * as CSS variables de tema do tenant e as classes Tailwind mapeadas.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Você está offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center"
      role="main"
    >
      {/* Ícone decorativo — SVG inline para não depender de rede */}
      <svg
        aria-hidden="true"
        focusable="false"
        width="80"
        height="80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary opacity-70"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
      </svg>

      <div className="max-w-md">
        <h1 className="font-heading text-2xl font-bold text-fg">
          Você está offline
        </h1>
        <p className="mt-3 text-fg/70">
          Não foi possível carregar esta página. Verifique sua conexão com a
          internet e tente novamente.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-[var(--radius-base)] bg-primary px-6 py-3 text-sm font-semibold text-[color:var(--color-primary-fg)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Tentar novamente
      </Link>

      <p className="text-xs text-fg/50">
        Algumas páginas visitadas anteriormente podem estar disponíveis mesmo
        sem conexão.
      </p>
    </div>
  );
}
