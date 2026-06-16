/**
 * Cards de conformidade e selos (Transparência, Diário Oficial, Dados Abertos).
 * Server Component estático.
 * Tokens: bg-muted/50, text-fg, bg-primary, text-primary-fg, border-border.
 */

const CARDS = [
  {
    id: 'transparencia',
    titulo: 'Portal da Transparência',
    desc: 'Acesso às despesas, receitas, licitações e contratos do município.',
    href: '/transparencia',
    cta: 'Acessar Transparência',
    icon: (
      <svg aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    selo: 'Dados Abertos',
  },
  {
    id: 'diario',
    titulo: 'Diário Oficial Eletrônico',
    desc: 'Publicações e atos oficiais do município em formato digital.',
    href: '/diario',
    cta: 'Consultar Diário',
    icon: (
      <svg aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    selo: 'Publicação Oficial',
  },
  {
    id: 'radar',
    titulo: 'Documentos e Planejamento',
    desc: 'PPA, LDO, LOA, RREO, RGF e balanço geral — prestação de contas (LRF).',
    href: '/transparencia/documentos',
    cta: 'Ver documentos',
    icon: (
      <svg aria-hidden="true" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    selo: 'Radar Atricon',
  },
];

export default function DestaqueConformidade() {
  return (
    <section aria-labelledby="conformidade-titulo" className="py-10 bg-muted/50">
      <div className="mx-auto max-w-7xl px-4">
        <h2 id="conformidade-titulo" className="font-heading text-xl font-bold text-fg mb-6 text-center">
          Transparência e conformidade
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {CARDS.map((c) => (
            <article
              key={c.id}
              className="relative flex flex-col rounded border border-border bg-bg p-5 transition-shadow hover:shadow-md"
              aria-labelledby={`conf-${c.id}`}
            >
              {/* Selo */}
              <span className="absolute right-3 top-3 rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                {c.selo}
              </span>

              <div className="mb-3 text-primary">{c.icon}</div>
              <h3 id={`conf-${c.id}`} className="font-heading font-bold text-fg mb-2">
                {c.titulo}
              </h3>
              <p className="text-sm text-fg/70 mb-4 flex-1">{c.desc}</p>
              <a
                href={c.href}
                className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {c.cta}
                <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                </svg>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
