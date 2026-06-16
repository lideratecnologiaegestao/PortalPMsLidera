'use client';

import { apiBase } from '../../../lib/auth-shared';
import type { PlataformaUser } from '../../../lib/platform';

/**
 * Shell do Gerenciador da Plataforma.
 * Topbar com título, nome do super_admin e botão "Sair".
 * Sem sidebar de tenant — é um app enxuto de gestão.
 */
export default function PlataformaShell({
  user,
  children,
}: {
  user: PlataformaUser;
  children: React.ReactNode;
}) {
  async function sair() {
    try {
      await fetch(`${apiBase}/api/_platform/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* ignora erro de rede — redireciona de qualquer forma */
    }
    window.location.href = '/';
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      {/* Topbar */}
      <header className="flex h-14 items-center gap-3 border-b border-border bg-primary px-4 text-primary-fg">
        {/* Skip link */}
        <a
          href="#plataforma-conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-bg focus:px-3 focus:py-1.5 focus:text-primary focus:ring-2 focus:ring-primary"
        >
          Ir para o conteúdo principal
        </a>

        {/* Ícone */}
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-fg/20 text-sm font-bold"
        >
          G
        </span>

        <span className="font-heading text-base font-bold">
          Gerenciador da Plataforma
        </span>

        {/* Navegação entre seções */}
        <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Seções da plataforma">
          <a href="/plataforma" className="rounded px-2.5 py-1 text-sm font-medium text-primary-fg/90 hover:bg-primary-fg/10">
            Entidades
          </a>
          <a href="/plataforma/configuracoes" className="rounded px-2.5 py-1 text-sm font-medium text-primary-fg/90 hover:bg-primary-fg/10">
            Configurações
          </a>
        </nav>

        {/* Spacer */}
        <div className="ml-auto flex items-center gap-3">
          {/* Nome do usuário */}
          <span className="hidden text-sm font-medium sm:block" aria-label={`Usuário: ${user.nome}`}>
            {user.nome}
          </span>
          <span className="hidden rounded bg-primary-fg/20 px-1.5 py-0.5 text-xs sm:inline">
            super_admin
          </span>

          {/* Botão Sair */}
          <button
            type="button"
            onClick={sair}
            className="flex items-center gap-1.5 rounded border border-primary-fg/40 px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-fg/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg"
            aria-label="Sair do Gerenciador da Plataforma"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo central */}
      <main
        id="plataforma-conteudo"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
