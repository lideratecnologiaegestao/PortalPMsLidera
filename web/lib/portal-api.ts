/**
 * Helpers SSR para buscar dados públicos do portal (banners, notícias,
 * secretarias, serviços). Repassam x-forwarded-host para resolução do tenant.
 *
 * ATENÇÃO: este módulo usa `next/headers` (server-only).
 * Para tipagem em Client Components, importe de `lib/portal-types.ts`.
 *
 * Fronteira de camadas: o frontend NUNCA acessa banco/storage diretamente.
 * Tudo passa pela API (CLAUDE.md regra 2b).
 */

import { headers } from 'next/headers';
import type {
  Banner,
  BuscaResult,
  BuscaResultado,
  BuscaTipo,
  GaleriaItem,
  HomeData,
  MenuItem,
  Noticia,
  NoticiaDetalhe,
  NoticiasResult,
  Secretaria,
  Servico,
  ServicoAvaliado,
  ServicoDetalhe,
} from './portal-types';

// Re-export types so existing server-side imports still work
export type { Banner, BuscaResult, BuscaResultado, BuscaTipo, GaleriaItem, HomeData, MenuItem, Noticia, NoticiaDetalhe, NoticiasResult, Secretaria, Servico, ServicoAvaliado, ServicoDetalhe };

const API = process.env.API_URL ?? 'http://localhost:3001';
const REVALIDATE = 120;

function tenantHeaders(): Record<string, string> {
  const host = headers().get('host') ?? '';
  return { 'x-forwarded-host': host };
}

/**
 * Monta a URL incluindo o HOST como parâmetro de cache (`__h`).
 *
 * Multi-tenant CRÍTICO: o cache de fetch do Next.js indexa por URL e IGNORA os
 * headers da requisição. Sem o host na URL, a resposta de um tenant seria
 * servida a TODOS (cache cross-tenant). O `__h` torna a chave de cache única por
 * tenant (a API ignora o parâmetro; a resolução continua pelo x-forwarded-host).
 */
function tenantUrl(path: string): string {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  return `${API}${path}${sep}__h=${encodeURIComponent(host)}`;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export async function getBanners(): Promise<Banner[]> {
  try {
    const res = await fetch(tenantUrl('/api/banners'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['banners'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getNoticias(params?: {
  page?: number;
  pageSize?: number;
  categoria?: string;
  q?: string;
}): Promise<NoticiasResult> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  if (params?.categoria) sp.set('categoria', params.categoria);
  if (params?.q) sp.set('q', params.q);

  try {
    const res = await fetch(tenantUrl(`/api/noticias?${sp.toString()}`), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['noticias'] },
    });
    if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 6 };
    return res.json();
  } catch {
    return { items: [], total: 0, page: 1, pageSize: 6 };
  }
}

export async function getNoticiaBySlug(slug: string): Promise<NoticiaDetalhe | null> {
  try {
    const res = await fetch(tenantUrl(`/api/noticias/${slug}`), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: [`noticia:${slug}`] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getSecretarias(): Promise<Secretaria[]> {
  try {
    const res = await fetch(tenantUrl('/api/secretarias'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['secretarias'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Busca a árvore de menus do tenant para o local especificado.
 * Chave de cache por tenant via `__h=<host>` (crítico para multi-tenant —
 * sem isso, o cache Next indexa por URL e serve o menu de um tenant a todos).
 */
/** Páginas CMS publicadas (slug + título) — para o Mapa do Site. */
export async function getPaginasPublicadas(): Promise<{ slug: string; titulo: string }[]> {
  try {
    const res = await fetch(tenantUrl('/api/pages'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['cms-paginas'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Documentação LGPD publicada do tenant (HTML) — para /privacidade/sobre-lgpd. */
export async function getLgpdPublico(): Promise<{ html: string; atualizadoEm: string | null } | null> {
  try {
    const res = await fetch(tenantUrl('/api/lgpd/publico'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['lgpd-publico'] },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.html ? data : null;
  } catch {
    return null;
  }
}

export async function getMenus(local: 'cabecalho' | 'rodape'): Promise<MenuItem[]> {
  try {
    const res = await fetch(tenantUrl(`/api/menus?local=${local}`), {
      headers: tenantHeaders(),
      next: { revalidate: 120, tags: [`menus:${local}`] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export interface EstruturaUnidade {
  id: string; nome: string; sigla?: string | null; responsavel?: string | null; cargo?: string | null;
  telefone?: string | null; email?: string | null; endereco?: string | null; cep?: string | null;
  horario?: string | null; fotoUrl?: string | null; latitude?: number | null; longitude?: number | null;
}
export interface EstruturaOrgao {
  id: string; nome: string; tipo: string; sigla?: string | null; slug?: string | null;
  responsavel?: string | null; secretarioCargo?: string | null; fotoUrl?: string | null;
  descricao?: string | null; email?: string | null; telefone?: string | null; unidades: EstruturaUnidade[];
}
export interface EstruturaAutoridade { id: string; cargo: string; nome: string; fotoUrl?: string | null; email?: string | null; telefone?: string | null; bio?: string | null }
export interface Estrutura {
  gabinete: (EstruturaOrgao & { autoridades: EstruturaAutoridade[] }) | null;
  controle: EstruturaOrgao[];
  orgaos: EstruturaOrgao[];
}

export async function getEstrutura(): Promise<Estrutura | null> {
  try {
    const res = await fetch(tenantUrl('/api/secretarias/estrutura'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['estrutura'] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface Prefeito {
  id: string; tipo: string; nome: string; genero: string; partido: string | null; fotoUrl: string | null;
  mandatoInicio: number | null; mandatoFim: number | null; atual: boolean;
  resumo: string | null; historia: string | null; email: string | null; telefone: string | null;
}
export interface PrefeitosPayload {
  prefeito: Prefeito | null;
  vice: Prefeito | null;
  anteriores: Prefeito[];
}

export async function getPrefeitos(): Promise<PrefeitosPayload | null> {
  try {
    const host = headers().get('host') ?? '';
    const res = await fetch(tenantUrl('/api/prefeitos'), {
      headers: tenantHeaders(),
      // tag por host: permite invalidação sob demanda só deste tenant ao salvar.
      next: { revalidate: REVALIDATE, tags: ['prefeitos', `prefeitos:${host}`] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getSecretariaBySlug(slug: string): Promise<Secretaria | null> {
  try {
    const res = await fetch(tenantUrl(`/api/secretarias/${encodeURIComponent(slug)}`), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: [`secretaria:${slug}`] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getServicos(params?: {
  publicoAlvo?: string;
  q?: string;
}): Promise<Servico[]> {
  try {
    const sp = new URLSearchParams();
    if (params?.publicoAlvo) sp.set('publicoAlvo', params.publicoAlvo);
    if (params?.q) sp.set('q', params.q);
    const query = sp.toString();
    const res = await fetch(tenantUrl(`/api/servicos${query ? `?${query}` : ''}`), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['servicos'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getServicosDestaque(): Promise<Servico[]> {
  try {
    const res = await fetch(tenantUrl('/api/servicos?destaque=true'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['servicos'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getServicosMaisAvaliados(): Promise<ServicoAvaliado[]> {
  try {
    const res = await fetch(tenantUrl('/api/servicos/mais-avaliados'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['servicos'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getServicoBySlug(slug: string): Promise<ServicoDetalhe | null> {
  try {
    const res = await fetch(tenantUrl(`/api/servicos/${encodeURIComponent(slug)}`), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: [`servico:${slug}`] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getHome(): Promise<HomeData | null> {
  try {
    const res = await fetch(tenantUrl('/api/home'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['home'] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getGaleria(tipo?: 'foto' | 'video'): Promise<GaleriaItem[]> {
  try {
    const path = tipo ? `/api/galeria?tipo=${tipo}` : '/api/galeria';
    const res = await fetch(tenantUrl(path), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['galeria'] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ─── Buscador Unificado ───────────────────────────────────────────────────────

/**
 * Busca unificada — chama GET /api/busca.
 *
 * Não usa cache (`cache: 'no-store'`) pois os resultados dependem do termo
 * digitado pelo usuário e podem mudar a qualquer momento.
 *
 * O `__h=<host>` ainda é incluído na URL para que o Next.js possa diferenciar
 * a chave no router cache (que não cacheia por header), mas o fetch em si
 * é sempre fresco.
 */
export async function getBusca(
  q: string,
  opts?: { tipo?: string; page?: number; pageSize?: number },
): Promise<BuscaResult> {
  const sp = new URLSearchParams({ q });
  if (opts?.tipo) sp.set('tipo', opts.tipo);
  if (opts?.page) sp.set('page', String(opts.page));
  if (opts?.pageSize) sp.set('pageSize', String(opts.pageSize));

  const empty: BuscaResult = { total: 0, page: 1, pageSize: 10, resultados: [] };
  try {
    const res = await fetch(tenantUrl(`/api/busca?${sp.toString()}`), {
      headers: tenantHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return empty;
    return res.json();
  } catch {
    return empty;
  }
}
