/**
 * Título de seção padrão da home — centralizado, com faixa de destaque (accent)
 * abaixo, no estilo institucional gov. Totalmente dirigido por tokens do tema
 * (text-primary, bg-accent, font-heading). Opcionalmente recebe um link "ver
 * todos" renderizado centralizado abaixo do conteúdo (use <VerTodos/>).
 */
export default function SecaoTitulo({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-8 text-center">
      <h2 id={id} className="font-heading text-2xl font-bold uppercase tracking-wide text-primary sm:text-[28px]">
        {children}
      </h2>
      <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-20 rounded-full bg-accent" />
    </div>
  );
}

/** Link "ver todos" centralizado, para o rodapé de uma seção. */
export function VerTodos({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 text-center">
      <a
        href={href}
        className="inline-flex items-center gap-1 rounded border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children}
      </a>
    </div>
  );
}
