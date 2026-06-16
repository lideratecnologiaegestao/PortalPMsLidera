interface EmConstrucaoProps {
  titulo: string;
  descricao?: string;
}

/**
 * Placeholder para modulos ainda nao implementados.
 * Evita 404 nos itens do menu e comunica o estado ao usuario.
 */
export default function EmConstrucao({ titulo, descricao }: EmConstrucaoProps) {
  return (
    <section aria-labelledby="em-construcao-titulo" className="flex flex-col items-center justify-center py-16 text-center">
      {/* Icone construcao inline */}
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="currentColor"
        className="text-warning mb-4"
      >
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
      </svg>

      <h1
        id="em-construcao-titulo"
        className="font-heading text-2xl font-bold text-fg"
      >
        {titulo}
      </h1>

      <p className="mt-3 max-w-md text-fg/60">
        {descricao ?? 'Este modulo esta em desenvolvimento e estara disponivel em breve.'}
      </p>

      <a
        href="/admin"
        className="mt-6 rounded border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
      >
        Voltar ao Painel
      </a>
    </section>
  );
}
