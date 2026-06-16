/**
 * Paginação de notícias. Server Component (renderizado no servidor,
 * mas gera links com searchParams para navegação SSR).
 * Tokens: bg-primary, text-primary-fg, border-border, text-fg, bg-muted.
 */

interface Props {
  page: number;
  totalPages: number;
  baseUrl: string;
  params?: { categoria?: string; q?: string };
}

function buildUrl(baseUrl: string, page: number, params?: Props['params']): string {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  if (params?.categoria) sp.set('categoria', params.categoria);
  if (params?.q) sp.set('q', params.q);
  return `${baseUrl}?${sp.toString()}`;
}

export default function PaginacaoNoticias({ page, totalPages, baseUrl, params }: Props) {
  // Gera array de páginas visíveis (janela de 5 ao redor da atual)
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav aria-label="Paginação de notícias" className="mt-8 flex justify-center">
      <ol className="flex flex-wrap items-center gap-1">
        {/* Anterior */}
        {page > 1 && (
          <li>
            <a
              href={buildUrl(baseUrl, page - 1, params)}
              aria-label="Página anterior"
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-sm text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
              </svg>
            </a>
          </li>
        )}

        {pages.map((p, idx) =>
          p === '...' ? (
            <li key={`ellipsis-${idx}`} aria-hidden="true">
              <span className="flex h-9 w-9 items-center justify-center text-sm text-fg/50">…</span>
            </li>
          ) : (
            <li key={p}>
              <a
                href={buildUrl(baseUrl, p, params)}
                aria-label={`Página ${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={`flex h-9 w-9 items-center justify-center rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  p === page
                    ? 'bg-primary text-primary-fg'
                    : 'border border-border text-fg hover:bg-muted'
                }`}
              >
                {p}
              </a>
            </li>
          )
        )}

        {/* Próxima */}
        {page < totalPages && (
          <li>
            <a
              href={buildUrl(baseUrl, page + 1, params)}
              aria-label="Próxima página"
              className="flex h-9 w-9 items-center justify-center rounded border border-border text-sm text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
              </svg>
            </a>
          </li>
        )}
      </ol>
    </nav>
  );
}
