/**
 * Tipos e fetcher SSR do resolver público de campanhas.
 *
 * Padrão idêntico ao portal-api.ts: repassa x-forwarded-host, inclui __h=<host>
 * na URL para isolar o cache do Next por tenant, revalidate 30s.
 *
 * Nunca lança exceção: retorna contexto vazio em qualquer falha para não
 * bloquear o SSR do portal.
 *
 * ATENÇÃO: usa next/headers — server-only.
 */

import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

// ─── Tipos do contexto (espelham §4 do CONTRATO-fase1.md) ─────────────────────

export interface CampanhaTema {
  campaignId: string;
  corPrimaria: string;
  corPrimariaFg?: string | null;
  corDestaque?: string | null;
  corSecundaria?: string | null;
  /** "todo" | "home" — default "todo" */
  aplicarEm?: string | null;
}

export interface CampanhaFaixaItem {
  campaignId: string;
  mensagem: string;
  link?: string | null;
  corBg: string;
  corTexto: string;
  dismissivel: boolean;
}

export interface CampanhaBannerItem {
  campaignId: string;
  imagemUrl: string;
  alt: string;
  link?: string | null;
  /** "home_topo" | "home_secao" */
  posicao?: string | null;
}

export interface CampanhaPopup {
  campaignId: string;
  titulo: string;
  subtitulo?: string | null;
  descricao?: string | null;
  bullets?: string[] | null;
  imagemUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** "sempre" | "dia" | "sessao" */
  frequencia?: string | null;
  paginaAlvo?: string | null;
  reabrirAposDias?: number | null;
}

export interface CampanhaEfeito {
  campaignId: string;
  /** "aedes-overlay" | "copa-overlay" */
  nome: string;
  params?: Record<string, unknown> | null;
  /** Escopo de página: ausente = todas; "/" = só a home; "/rota" = exata/prefixo. */
  paginaAlvo?: string | null;
  /** Mostra ao visitante um botão para parar o efeito (default true). */
  permitirParar?: boolean;
  /** Encerra o efeito após N segundos (ausente/0 = enquanto estiver na página). */
  duracaoSegundos?: number | null;
}

export interface CampanhaSelo {
  campaignId: string;
  texto: string;
  cor?: string | null;
  link?: string | null;
}

export interface CampanhaPagina {
  campaignId: string;
  slug: string;
}

/** Contexto completo retornado por GET /api/campanhas/ativas (§4). */
export interface CampanhasContexto {
  tema: CampanhaTema | null;
  /** Máx 2 */
  faixas: CampanhaFaixaItem[];
  /** Máx 3 */
  banners: CampanhaBannerItem[];
  popup: CampanhaPopup | null;
  /** Máx 1 */
  efeitos: CampanhaEfeito[];
  selos: CampanhaSelo[];
  paginas: CampanhaPagina[];
}

/** Contexto vazio (seguro para renderizar sem nenhum efeito). */
const VAZIO: CampanhasContexto = {
  tema: null,
  faixas: [],
  banners: [],
  popup: null,
  efeitos: [],
  selos: [],
  paginas: [],
};

// ─── Fetcher SSR ──────────────────────────────────────────────────────────────

/**
 * Busca o contexto de campanhas ativas do tenant resolvido pelo Host.
 * Revalidate 30s (mesma granularidade do tema).
 * Nunca propaga exceção — retorna VAZIO em qualquer erro.
 */
export async function getCampanhasAtivas(): Promise<CampanhasContexto> {
  try {
    const host = headers().get('host') ?? '';
    const url = `${API}/api/campanhas/ativas?__h=${encodeURIComponent(host)}`;
    const res = await fetch(url, {
      headers: { 'x-forwarded-host': host },
      // revalidate curto: ao ligar/desligar uma campanha no admin, o contexto
      // novo aparece no portal em poucos segundos (o backend já invalida o cache
      // Redis na hora; este TTL controla a borda do SSR do Next).
      next: { revalidate: 8, tags: [`campanhas:${host}`] },
    });
    if (!res.ok) return VAZIO;
    const data: Partial<CampanhasContexto> = await res.json();
    return {
      tema: data.tema ?? null,
      faixas: Array.isArray(data.faixas) ? data.faixas : [],
      banners: Array.isArray(data.banners) ? data.banners : [],
      popup: data.popup ?? null,
      efeitos: Array.isArray(data.efeitos) ? data.efeitos : [],
      selos: Array.isArray(data.selos) ? data.selos : [],
      paginas: Array.isArray(data.paginas) ? data.paginas : [],
    };
  } catch {
    return VAZIO;
  }
}
