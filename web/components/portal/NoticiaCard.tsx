/**
 * Card de notícia reutilizável.
 * Server Component (sem interatividade).
 * Tokens: bg-bg, text-fg, border-border, bg-primary, text-primary-fg,
 *   text-fg/60, bg-muted.
 */

import type { Noticia } from '../../lib/portal-types';

interface Props {
  noticia: Noticia;
  variant?: 'default' | 'destaque';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function NoticiaCard({ noticia, variant = 'default' }: Props) {
  if (variant === 'destaque') {
    return (
      <article
        aria-labelledby={`noticia-destaque-${noticia.id}`}
        className="group relative h-full overflow-hidden rounded-xl border border-border bg-bg shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg"
      >
        {noticia.imagemUrl && (
          <div className="aspect-video overflow-hidden">
            <img
              src={noticia.imagemUrl}
              alt={`Imagem da notícia: ${noticia.titulo}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="eager"
            />
          </div>
        )}
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            {noticia.categoria && (
              <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
                {noticia.categoria}
              </span>
            )}
            <time dateTime={noticia.publicadoEm} className="text-xs font-semibold text-accent">
              {formatDate(noticia.publicadoEm)}
            </time>
          </div>
          <h3 id={`noticia-destaque-${noticia.id}`} className="mb-2 font-heading text-xl font-bold leading-snug text-primary">
            <a
              href={`/noticias/${noticia.slug}`}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded after:absolute after:inset-0 after:content-['']"
            >
              {noticia.titulo}
            </a>
          </h3>
          <p className="text-sm leading-relaxed text-fg/70 line-clamp-3">{noticia.resumo}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary group-hover:gap-2 transition-all">
            Leia mais <span aria-hidden="true">➔</span>
          </span>
        </div>
      </article>
    );
  }

  return (
    <article
      aria-labelledby={`noticia-${noticia.id}`}
      className="group relative flex gap-3 rounded-lg border border-border bg-bg p-3 transition-all hover:border-primary hover:shadow-sm"
    >
      {noticia.imagemUrl && (
        <div className="h-20 w-24 shrink-0 overflow-hidden rounded">
          <img
            src={noticia.imagemUrl}
            alt={`Imagem da notícia: ${noticia.titulo}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {noticia.categoria && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
              {noticia.categoria}
            </span>
          )}
          <time dateTime={noticia.publicadoEm} className="text-xs font-semibold text-accent">
            {formatDate(noticia.publicadoEm)}
          </time>
        </div>
        <h3 id={`noticia-${noticia.id}`} className="font-medium text-sm text-fg leading-snug line-clamp-2">
          <a
            href={`/noticias/${noticia.slug}`}
            className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded after:absolute after:inset-0 after:content-['']"
          >
            {noticia.titulo}
          </a>
        </h3>
        <p className="mt-0.5 text-xs text-fg/60 line-clamp-2 hidden sm:block">{noticia.resumo}</p>
      </div>
    </article>
  );
}
