/**
 * Página de detalhe de notícia.
 * SSR com revalidate via lib/portal-api.
 * Acessível: landmarks, heading hierárquico, conteúdo acessível,
 * metadados/SEO (Open Graph).
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNoticiaBySlug, getNoticias } from '../../../lib/portal-api';
import Comentarios from './Comentarios';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const noticia = await getNoticiaBySlug(params.slug);
  if (!noticia) return { title: 'Notícia não encontrada' };

  return {
    title: noticia.titulo,
    description: noticia.resumo,
    openGraph: {
      title: noticia.titulo,
      description: noticia.resumo,
      type: 'article',
      publishedTime: noticia.publicadoEm,
      authors: noticia.autor ? [noticia.autor] : undefined,
      images: noticia.imagemUrl ? [{ url: noticia.imagemUrl, alt: noticia.titulo }] : undefined,
    },
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default async function NoticiaDetalhePage({ params }: Props) {
  const [noticia, maisNoticias] = await Promise.all([
    getNoticiaBySlug(params.slug),
    getNoticias({ pageSize: 4 }),
  ]);

  if (!noticia) notFound();

  const relacionadas = maisNoticias.items
    .filter((n) => n.slug !== params.slug)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Localização na página" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-fg/60">
          <li><a href="/" className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">Início</a></li>
          <li aria-hidden="true"><span className="mx-1">/</span></li>
          <li><a href="/noticias" className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">Notícias</a></li>
          <li aria-hidden="true"><span className="mx-1">/</span></li>
          <li aria-current="page" className="truncate max-w-xs text-fg">{noticia.titulo}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Artigo principal */}
        <article className="lg:col-span-2" aria-labelledby="noticia-titulo">
          {/* Meta */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-fg">
              {noticia.categoria}
            </span>
            <time dateTime={noticia.publicadoEm} className="text-xs text-fg/60">
              {formatDate(noticia.publicadoEm)}
            </time>
            {noticia.visualizacoes !== undefined && (
              <span className="text-xs text-fg/50" aria-label={`${noticia.visualizacoes} visualizações`}>
                {noticia.visualizacoes.toLocaleString('pt-BR')} visualizações
              </span>
            )}
          </div>

          <h1 id="noticia-titulo" className="font-heading text-2xl font-bold text-fg mb-3 leading-snug sm:text-3xl">
            {noticia.titulo}
          </h1>

          <p className="text-base text-fg/70 mb-5 leading-relaxed border-l-4 border-primary pl-4">
            {noticia.resumo}
          </p>

          {noticia.autor && (
            <p className="mb-5 text-sm text-fg/60">
              Por <span className="font-medium text-fg">{noticia.autor}</span>
            </p>
          )}

          {/* Imagem de destaque */}
          {noticia.imagemUrl && (
            <figure className="mb-6 overflow-hidden rounded border border-border">
              <img
                src={noticia.imagemUrl}
                alt={`Imagem da notícia: ${noticia.titulo}`}
                className="h-auto w-full object-cover"
                loading="eager"
              />
            </figure>
          )}

          {/* Conteúdo — renderizado como HTML (API retorna HTML sanitizado) */}
          <div
            className="prose-portal max-w-none text-fg"
            dangerouslySetInnerHTML={{ __html: noticia.conteudo }}
          />

          {/* Compartilhamento acessível (URLs sem window — resolução no cliente via JS nativo) */}
          <div className="mt-8 border-t border-border pt-5">
            <p className="text-sm font-semibold text-fg mb-3">Compartilhar:</p>
            <div className="flex flex-wrap gap-2" aria-label="Opções de compartilhamento">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`/noticias/${noticia.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Compartilhar no Facebook (abre em nova aba)"
              >
                Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(noticia.titulo)}&url=${encodeURIComponent(`/noticias/${noticia.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Compartilhar no X (Twitter) (abre em nova aba)"
              >
                X (Twitter)
              </a>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${noticia.titulo} — /noticias/${noticia.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-3 py-1.5 text-xs text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Compartilhar no WhatsApp (abre em nova aba)"
              >
                WhatsApp
              </a>
            </div>
          </div>

          <div className="mt-5">
            <a
              href="/noticias"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
              </svg>
              Voltar para Notícias
            </a>
          </div>

          {/* Seção de comentários — Client Component (requer interação) */}
          <Comentarios noticiaId={noticia.id} />
        </article>

        {/* Sidebar: notícias relacionadas */}
        {relacionadas.length > 0 && (
          <aside aria-labelledby="relacionadas-titulo">
            <h2 id="relacionadas-titulo" className="font-heading text-base font-bold text-fg mb-4">
              Outras notícias
            </h2>
            <ul className="space-y-4">
              {relacionadas.map((n) => (
                <li key={n.id} className="border-b border-border pb-4 last:border-0">
                  <article aria-labelledby={`rel-${n.id}`}>
                    <span className="text-xs text-primary font-semibold">{n.categoria}</span>
                    <h3 id={`rel-${n.id}`} className="mt-0.5 text-sm font-medium text-fg leading-snug">
                      <a
                        href={`/noticias/${n.slug}`}
                        className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      >
                        {n.titulo}
                      </a>
                    </h3>
                    <time dateTime={n.publicadoEm} className="mt-1 block text-xs text-fg/50">
                      {formatDate(n.publicadoEm)}
                    </time>
                  </article>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
