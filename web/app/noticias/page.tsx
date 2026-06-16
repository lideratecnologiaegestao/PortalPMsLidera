/**
 * Página de listagem de notícias — com filtro por categoria e busca.
 * Server Component com SSR/ISR (revalidate via lib/portal-api).
 * Paginação via searchParams.
 */

import type { Metadata } from 'next';
import { getThemeData } from '../../lib/theme';
import { getNoticias } from '../../lib/portal-api';
import NoticiaCard from '../../components/portal/NoticiaCard';
import PaginacaoNoticias from './_components/PaginacaoNoticias';
import FiltroNoticias from './_components/FiltroNoticias';

interface SearchParams {
  page?: string;
  categoria?: string;
  q?: string;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { portal } = await getThemeData();
    return {
      title: `Notícias — ${portal.nome}`,
      description: `Últimas notícias e informações da Prefeitura de ${portal.nome}.`,
    };
  } catch {
    return { title: 'Notícias — Portal Municipal' };
  }
}

const PAGE_SIZE = 12;

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const categoria = searchParams.categoria?.trim() || undefined;
  const q = searchParams.q?.trim() || undefined;

  const result = await getNoticias({ page, pageSize: PAGE_SIZE, categoria, q });
  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Localização na página" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-fg/60">
          <li><a href="/" className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">Início</a></li>
          <li aria-hidden="true"><span className="mx-1">/</span></li>
          <li aria-current="page" className="text-fg font-medium">Notícias</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold text-fg">Notícias</h1>
        {result.total > 0 && (
          <p className="text-sm text-fg/60">
            {result.total} {result.total === 1 ? 'notícia encontrada' : 'notícias encontradas'}
          </p>
        )}
      </div>

      {/* Filtros */}
      <FiltroNoticias categoriaAtiva={categoria} buscaAtiva={q} />

      {/* Lista */}
      {result.items.length === 0 ? (
        <div className="rounded border border-border bg-muted/30 px-6 py-12 text-center" role="status">
          <p className="text-fg/60 text-sm">
            {q || categoria
              ? 'Nenhuma notícia encontrada para os filtros selecionados.'
              : 'Nenhuma notícia publicada ainda.'}
          </p>
          {(q || categoria) && (
            <a href="/noticias" className="mt-3 inline-block text-sm text-primary underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
              Limpar filtros
            </a>
          )}
        </div>
      ) : (
        <>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Lista de notícias">
            {result.items.map((n) => (
              <li key={n.id}>
                <NoticiaCard noticia={n} variant="destaque" />
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <PaginacaoNoticias
              page={page}
              totalPages={totalPages}
              baseUrl="/noticias"
              params={{ categoria, q }}
            />
          )}
        </>
      )}
    </div>
  );
}
