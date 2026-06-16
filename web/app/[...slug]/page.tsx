import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPagina } from '../../lib/cms';
import { BlockRenderer } from '../../components/cms/Blocks';

interface Props {
  params: { slug: string[] };
}

/**
 * Metadados SEO por página CMS. Usa page.seo quando presente, com fallback ao
 * titulo da página. Equivalente ao generateMetadata de /noticias/[slug].
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (params.slug ?? []).join('/');
  const pagina = await getPagina(slug);
  if (!pagina) return { title: 'Página não encontrada' };

  const seo = pagina.seo ?? {};
  const title = seo.title ? String(seo.title) : pagina.titulo;
  const description = seo.description ? String(seo.description) : undefined;
  const ogImage = seo.ogImage ? String(seo.ogImage) : undefined;
  const keywords = seo.keywords ? String(seo.keywords) : undefined;

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: 'website',
      images: ogImage ? [{ url: ogImage, alt: title }] : undefined,
    },
  };
}

/**
 * Renderizador de páginas do CMS (catch-all). Rotas estáticas (/, /painel,
 * /transparencia/*) têm precedência; só caminhos não casados chegam aqui e são
 * resolvidos como páginas do CMS do tenant (ex.: /historia, /secretaria/saude).
 */
export default async function CmsCatchAll({ params }: Props) {
  const slug = (params.slug ?? []).join('/');
  const pagina = await getPagina(slug);
  if (!pagina) notFound();

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <h1 className="sr-only">{pagina.titulo}</h1>
      <BlockRenderer blocos={pagina.blocks} />
    </article>
  );
}
