/**
 * Cabeçalho principal do portal (sticky).
 * Server Component: recebe tokens/portal do layout.
 *
 * Tokens usados: bg-bg, text-fg, border-border, text-primary,
 *   bg-primary, text-primary-fg, bg-danger, text-danger-fg.
 */

import { ThemeTokens, PortalInfo, LogoTamanho } from '../../lib/theme';
import UserMenu from '../UserMenu';
import SearchBar from './SearchBar';

interface Props {
  tokens: ThemeTokens;
  portal: PortalInfo;
}

/** Mapeia o token logoTamanho para classes Tailwind de altura. */
const LOGO_ALTURA: Record<LogoTamanho, string> = {
  pequeno: 'h-8',
  medio:   'h-12',
  grande:  'h-16',
  enorme:  'h-20',
};

export default function SiteHeader({ tokens, portal }: Props) {
  const alturaClasse = LOGO_ALTURA[tokens.logoTamanho ?? 'medio'];

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-bg shadow-sm"
      role="banner"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Identidade do município */}
        <a
          href="/"
          className="flex shrink-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          aria-label={`Página inicial — ${portal.nome}`}
        >
          {tokens.logo.url && tokens.logo.url !== '/brasao-placeholder.svg' ? (
            <img
              src={tokens.logo.url}
              alt={tokens.logo.alt || `Brasão de ${portal.nome}`}
              className={`${alturaClasse} w-auto`}
              width={48}
              height={48}
            />
          ) : (
            /* Placeholder quando o token não tiver URL real */
            <div
              className={`flex ${alturaClasse} w-auto aspect-square shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg font-heading font-bold text-lg`}
              aria-hidden="true"
            >
              {portal.nome.charAt(0)}
            </div>
          )}
          <div className="hidden sm:block">
            <div className="font-heading text-base font-bold leading-tight text-fg">
              {portal.nome}
            </div>
            <div className="text-xs text-fg/60">Portal Municipal — {portal.uf}</div>
          </div>
        </a>

        {/* Busca proeminente — label visível em md+ */}
        <div id="busca" className="flex-1 max-w-lg">
          <SearchBar />
        </div>

        {/* Botões Ouvidoria + e-SIC + login */}
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/ouvidoria"
            className="hidden sm:inline-flex items-center gap-1.5 rounded bg-danger px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Ouvidoria
          </a>
          <a
            href="/esic"
            title="e-SIC — Serviço de Informação ao Cidadão"
            className="hidden sm:inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            e-SIC
          </a>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
