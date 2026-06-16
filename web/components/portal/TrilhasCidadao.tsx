/**
 * Trilhas por público: Cidadão / Empresa / Servidor.
 * Server Component estático.
 * Tokens: bg-bg, text-fg, bg-primary, text-primary-fg, border-border,
 *   bg-muted, hover:bg-primary/5.
 */

const TRILHAS = [
  {
    id: 'cidadao',
    titulo: 'Cidadão',
    descricao: 'Acesse serviços, ouvidoria, IPTU e certidões.',
    href: '/servicos?publico=cidadao',
    icon: (
      <svg aria-hidden="true" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    links: [
      { label: 'Ouvidoria', href: '/ouvidoria' },
      { label: 'Acesso à Informação', href: '/esic' },
      { label: 'Serviços Online', href: '/servicos' },
      { label: 'IPTU / Certidões', href: '/servicos/iptu' },
    ],
  },
  {
    id: 'empresa',
    titulo: 'Empresa',
    descricao: 'Alvarás, licitações, Nota Fiscal e cadastros empresariais.',
    href: '/servicos?publico=empresa',
    icon: (
      <svg aria-hidden="true" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
      </svg>
    ),
    links: [
      { label: 'Alvará de Funcionamento', href: '/servicos/alvara' },
      { label: 'Nota Fiscal Eletrônica', href: '/servicos/nfe' },
      { label: 'Licitações', href: '/transparencia/licitacoes' },
      { label: 'Cadastro Mobiliário', href: '/servicos/cadastro' },
    ],
  },
  {
    id: 'servidor',
    titulo: 'Servidor',
    descricao: 'Portal do servidor, contracheque, férias e capacitação.',
    href: '/servicos?publico=servidor',
    icon: (
      <svg aria-hidden="true" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    links: [
      { label: 'Contracheque', href: '/servidor/contracheque' },
      { label: 'Transparência — Folha', href: '/transparencia/folha' },
      { label: 'Concursos e Seletivos', href: '/transparencia/licitacoes?tipo=concurso' },
      { label: 'Portal do Servidor', href: '/servidor' },
    ],
  },
];

export default function TrilhasCidadao() {
  return (
    <section aria-labelledby="trilhas-titulo" className="bg-muted/50 py-10">
      <div className="mx-auto max-w-7xl px-4">
        <h2 id="trilhas-titulo" className="font-heading text-xl font-bold text-fg mb-6 text-center">
          Serviços por público
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {TRILHAS.map((t) => (
            <article
              key={t.id}
              className="rounded border border-border bg-bg p-5 transition-shadow hover:shadow-md"
              aria-labelledby={`trilha-${t.id}`}
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                {t.icon}
              </div>
              <h3 id={`trilha-${t.id}`} className="font-heading text-lg font-bold text-fg mb-1">
                {t.titulo}
              </h3>
              <p className="text-sm text-fg/70 mb-4">{t.descricao}</p>
              <ul className="space-y-1.5" aria-label={`Links para ${t.titulo}`}>
                {t.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                      <svg aria-hidden="true" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={t.href}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Ver todos →
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
