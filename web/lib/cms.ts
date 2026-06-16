import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface Bloco {
  id: string;
  tipo: string;
  conteudo: Record<string, unknown>;
  ordem: number;
}
export interface Pagina {
  id: string;
  slug: string;
  titulo: string;
  seo?: Record<string, unknown>;
  blocks: Bloco[];
}

/**
 * Busca uma página publicada do CMS (isolada por RLS pelo Host). Retorna null
 * em 404 (rota inexistente → o renderer chama notFound()). Cache ISR por slug.
 */
export async function getPagina(slug: string): Promise<Pagina | null> {
  const host = headers().get('host') ?? '';
  // `__h=<host>` isola o cache por tenant (Next indexa por URL e ignora headers).
  const res = await fetch(
    `${API}/api/pages/${encodeURIComponent(slug)}?__h=${encodeURIComponent(host)}`,
    {
      headers: { 'x-forwarded-host': host },
      next: { revalidate: 300, tags: [`cms:${slug}`] },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar a página.');
  return res.json();
}
