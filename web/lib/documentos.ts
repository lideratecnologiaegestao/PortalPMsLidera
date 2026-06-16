import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface DocItem {
  id: string;
  numero: string | null;
  ano: number | null;
  dataDocumento: string | null;
  titulo: string;
  ementa: string | null;
  orgao: string | null;
  situacao: string | null;
  downloads: number;
  arquivoUrl: string | null;
  tipo: { nome: string; slug: string } | null;
  /** Texto extraído do PDF pelo backend (extração nativa ou OCR). Pode ser longo. */
  conteudoExtraido?: string | null;
  /** Método usado para extrair o texto: 'nativo' | 'tesseract' | 'claude'. */
  ocrMetodo?: 'nativo' | 'tesseract' | 'claude' | null;
}

export interface TipoPublico {
  slug: string;
  nome: string;
  /**
   * O backend serializa o identificador do tipo pai como `parentId`.
   * Na API publica, esse valor e o slug do tipo pai (string) ou null.
   * A arvore e construida por correspondencia de slug <-> parentId.
   */
  parentId: string | null;
}

export interface CadastroPublico {
  cadastro: {
    slug: string;
    nome: string;
    descricao: string | null;
    visibilidade: 'publico' | 'restrito';
    tipos: TipoPublico[];
  };
  documentos: { total: number; page: number; pageSize: number; items: DocItem[] };
}

/** Busca um cadastro de documentos e seus itens (isolado por RLS via Host). */
export async function getCadastroDocumentos(
  cadastro: string,
  params: { tipo?: string; ano?: string; q?: string; page?: string },
): Promise<CadastroPublico | null> {
  const host = headers().get('host') ?? '';
  const qs = new URLSearchParams();
  if (params.tipo) qs.set('tipo', params.tipo);
  if (params.ano) qs.set('ano', params.ano);
  if (params.q) qs.set('q', params.q);
  if (params.page) qs.set('page', params.page);
  qs.set('__h', host); // isola o cache de fetch por tenant
  // no-store: a listagem reflete imediatamente o que o admin cadastra/edita.
  const res = await fetch(`${API}/api/documentos/${encodeURIComponent(cadastro)}?${qs}`, {
    headers: { 'x-forwarded-host': host },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar documentos.');
  return res.json() as Promise<CadastroPublico>;
}

/**
 * Busca um documento específico por id dentro de um cadastro.
 *
 * A API pública não expõe GET /api/documentos/:id diretamente; o endpoint
 * disponível é GET /api/documentos/:cadastroSlug (listagem paginada com pageSize
 * máximo de 60). Este helper varre as páginas da listagem até encontrar o id —
 * limitado a 10 páginas (600 documentos) para não gerar carga excessiva.
 *
 * Retorna null se o documento não for encontrado ou o cadastro não existir.
 */
export async function getDocumento(
  cadastroSlug: string,
  id: string,
): Promise<{ doc: DocItem; cadastroNome: string; cadastroSlug: string } | null> {
  const host = headers().get('host') ?? '';
  // Endpoint público direto por id (só retorna se o cadastro for público).
  try {
    const res = await fetch(
      `${API}/api/documentos/item/${encodeURIComponent(id)}?__h=${encodeURIComponent(host)}`,
      { headers: { 'x-forwarded-host': host }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as DocItem & { cadastro?: { nome: string; slug: string } };
    return {
      doc: d,
      cadastroNome: d.cadastro?.nome ?? '',
      cadastroSlug: d.cadastro?.slug ?? cadastroSlug,
    };
  } catch {
    return null;
  }
}
