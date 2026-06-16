import { headers } from 'next/headers';

export type LogoTamanho = 'pequeno' | 'medio' | 'grande' | 'enorme';

export interface ThemeTokens {
  colors: Record<string, string>;
  fonts: { sans: string; heading: string };
  radius: { base: string };
  logo: { url: string; alt: string };
  favicon: string;
  iconSet: string;
  /** Logo alternativo exibido no rodapé. Cai no `logo` principal se ausente. */
  logoRodape?: { url: string; alt: string };
  /** Logo para geração de relatórios/PDF. Cai no `logo` principal se ausente. */
  logoRelatorio?: { url: string; alt: string };
  /** Tamanho do logo no cabeçalho: pequeno=h-8, medio=h-12, grande=h-16, enorme=h-20. */
  logoTamanho?: LogoTamanho;
  /** Tamanho do logo no rodapé: pequeno=h-10, medio=h-14, grande=h-20, enorme=h-28. */
  logoRodapeTamanho?: LogoTamanho;
  /** Exibir nome e descrição da entidade no rodapé. Padrão true. */
  rodapeMostrarTexto?: boolean;
  /** Posição do texto em relação ao logo no rodapé: 'abaixo' (padrão) | 'lateral'. */
  rodapeTextoPosicao?: 'abaixo' | 'lateral';
  /** Título personalizado do rodapé. Se vazio, usa o nome do município. */
  rodapeTitulo?: string;
  /** Descrição personalizada do rodapé. Se vazio, usa a descrição da entidade. */
  rodapeDescricao?: string;
}

export interface PortalInfo {
  nome: string;
  uf: string;
  descricao?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  horario?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  twitter?: string;
  whatsapp?: string;
}

export interface ThemeData {
  tokens: ThemeTokens;
  wcag?: Record<string, unknown>;
  portal: PortalInfo;
  /** true quando o Host não corresponde a nenhuma prefeitura (404 da API). */
  notFound?: boolean;
}

const API = process.env.API_URL ?? 'http://localhost:3001';

/** Tema neutro de fallback (erro transitório ou host sem prefeitura). */
const FALLBACK: ThemeData = {
  tokens: {
    colors: {
      primary: '#1351b4',
      primaryFg: '#ffffff',
      secondary: '#2670e8',
      secondaryFg: '#ffffff',
      accent: '#0c326f',
      bg: '#ffffff',
      fg: '#1b1b1b',
      muted: '#f0f0f0',
      border: '#cccccc',
      success: '#168821',
      warning: '#ffcd07',
      danger: '#e52207',
    },
    fonts: { sans: 'system-ui, sans-serif', heading: 'system-ui, sans-serif' },
    radius: { base: '0.5rem' },
    logo: { url: '/brasao-placeholder.svg', alt: 'Brasão municipal' },
    favicon: '/favicon.ico',
    iconSet: 'default',
  },
  portal: { nome: 'Prefeitura Municipal', uf: 'BR' },
};

/**
 * Busca os tokens de tema do tenant atual. A API resolve o tenant pelo Host,
 * então repassamos o Host original da requisição. Cacheado por ISR (revalidate)
 * para que o RLS/transação no backend não pese em cada pageview.
 */
export async function getThemeData(): Promise<ThemeData> {
  const host = headers().get('host') ?? '';
  try {
    // `__h=<host>` torna a chave de cache do Next única por tenant — sem isso
    // o cache (indexado por URL, ignora headers) serviria o tema de um
    // município a todos. A API ignora o parâmetro (resolve por x-forwarded-host).
    const res = await fetch(`${API}/api/theme?__h=${encodeURIComponent(host)}`, {
      headers: { 'x-forwarded-host': host },
      next: { revalidate: 30, tags: [`theme:${host}`] },
    });
    // 404 = host sem prefeitura configurada → sinaliza notFound (não é erro
    // transitório). O layout renderiza "Município não encontrado".
    if (res.status === 404) {
      return { ...FALLBACK, notFound: true };
    }
    if (!res.ok) throw new Error('Falha ao carregar o tema do município.');
    return res.json();
  } catch {
    // Erro transitório (rede/dev): fallback seguro para não travar (sem notFound).
    return FALLBACK;
  }
}

/**
 * Retro-compatibilidade: componentes que só precisam dos tokens.
 */
export async function getThemeTokens(): Promise<{ tokens: ThemeTokens }> {
  const data = await getThemeData();
  return { tokens: data.tokens };
}

/** Converte tokens → string de CSS custom properties para injetar no :root. */
export function tokensToCss(tokens: ThemeTokens): string {
  const c = tokens.colors;
  const vars: Record<string, string> = {
    '--color-primary': c.primary,
    '--color-primary-fg': c.primaryFg,
    '--color-secondary': c.secondary,
    '--color-secondary-fg': c.secondaryFg,
    '--color-accent': c.accent,
    '--color-bg': c.bg,
    '--color-fg': c.fg,
    '--color-muted': c.muted,
    '--color-border': c.border,
    '--color-success': c.success,
    '--color-warning': c.warning,
    '--color-danger': c.danger,
    '--font-sans': tokens.fonts.sans,
    '--font-heading': tokens.fonts.heading,
    '--radius-base': tokens.radius.base,
  };
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `:root{${body}}`;
}
