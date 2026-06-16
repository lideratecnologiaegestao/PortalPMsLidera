/**
 * Presets de tema pré-configurados para novos tenants.
 * Cada preset segue o themeTokensSchema e foi validado contra WCAG AA.
 * Base comum: bg #FFFFFF, fg #1B1B1B, muted #F0F0F0, border #CCCCCC,
 * success #168821, warning #FFCD07, danger #E52207, primaryFg #FFFFFF,
 * fonts Rawline/system-ui. Logo/favicon são sobrescritos ao aplicar.
 */

// Tipo inline para evitar dependência circular com theme.service.ts
// (ThemeTokens é inferido do schema Zod — mesma estrutura)
export interface ThemeColors {
  primary: string;
  primaryFg: string;
  secondary: string;
  secondaryFg: string;
  accent: string;
  bg: string;
  fg: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ThemeTokensInline {
  colors: ThemeColors;
  fonts: { sans: string; heading: string };
  radius: { base: string };
  logo: { url: string; alt: string };
  logoRodape?: { url: string; alt: string };
  logoRelatorio?: { url: string; alt: string };
  logoTamanho: 'pequeno' | 'medio' | 'grande' | 'enorme';
  logoRodapeTamanho: 'pequeno' | 'medio' | 'grande' | 'enorme';
  rodapeMostrarTexto: boolean;
  rodapeTextoPosicao: 'abaixo' | 'lateral';
  rodapeTitulo?: string;
  rodapeDescricao?: string;
  favicon: string;
  iconSet: string;
}

const BASE_COLORS = {
  bg: '#FFFFFF',
  fg: '#1B1B1B',
  muted: '#F0F0F0',
  border: '#CCCCCC',
  success: '#168821',
  warning: '#FFCD07',
  danger: '#E52207',
  primaryFg: '#FFFFFF',
};

const BASE_FONTS = {
  sans: 'Rawline, system-ui, sans-serif',
  heading: 'Rawline, sans-serif',
};

const DEFAULT_LOGO = { url: '/favicon.ico', alt: 'Brasão do município' };
const DEFAULT_FAVICON = '/favicon.ico';
const DEFAULT_ICON_SET = 'lucide';

export interface ThemeTemplateSummary {
  id: string;
  nome: string;
  descricao: string;
  cores: { primary: string; secondary: string; accent: string };
}

export interface ThemeTemplate {
  id: string;
  nome: string;
  descricao: string;
  tokens: ThemeTokensInline;
}

export const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'sao-mateus-do-sul',
    nome: 'São Mateus do Sul',
    descricao: 'Azul profundo e dourado — clássico para municípios do Sul do Brasil.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#14306B',
        secondary: '#F4B400',
        secondaryFg: '#1B1B1B',
        accent: '#E8730A',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.5rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'sapezal',
    nome: 'Sapezal',
    descricao: 'Azul corporativo e amarelo vibrante — moderno e acessível.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#0B5CAD',
        secondary: '#FFD23F',
        secondaryFg: '#1B1B1B',
        accent: '#0AA1C7',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.375rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'sao-francisco-de-paula',
    nome: 'São Francisco de Paula',
    descricao: 'Azul institucional e verde serra gaúcha — natureza e tradição.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#14538A',
        secondary: '#2E7D32',
        secondaryFg: '#FFFFFF',
        accent: '#2E9E5B',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.5rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'betim',
    nome: 'Betim',
    descricao: 'Dois tons de azul com destaque âmbar — industrial e confiável.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#0D47A1',
        secondary: '#1565C0',
        secondaryFg: '#FFFFFF',
        accent: '#FFB300',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.25rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'inocencia',
    nome: 'Inocência',
    descricao: 'Azul-marinho e dourado envelhecido — elegância do sertão.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#0F2A4A',
        secondary: '#8C6516',
        secondaryFg: '#FFFFFF',
        accent: '#D4A017',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.375rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'cachoeira-do-sul',
    nome: 'Cachoeira do Sul',
    descricao: 'Azul petróleo e vermelho terra — força e identidade gaúcha.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#1C3D5A',
        secondary: '#9E3328',
        secondaryFg: '#FFFFFF',
        accent: '#C0552B',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.5rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
  {
    id: 'alto-garcas',
    nome: 'Alto Garças',
    descricao: 'Azul celeste e verde-água — frescor do cerrado mato-grossense.',
    tokens: {
      colors: {
        ...BASE_COLORS,
        primary: '#105E8A',
        secondary: '#0F766E',
        secondaryFg: '#FFFFFF',
        accent: '#14B8A6',
      },
      fonts: BASE_FONTS,
      radius: { base: '0.75rem' },
      logo: DEFAULT_LOGO,
      logoTamanho: 'medio' as const,
      logoRodapeTamanho: 'medio' as const,
      rodapeMostrarTexto: true,
      rodapeTextoPosicao: 'abaixo' as const,
      favicon: DEFAULT_FAVICON,
      iconSet: DEFAULT_ICON_SET,
    },
  },
];

/** Retorna resumo dos templates (id, nome, descricao, cores principais) para listagem. */
export function listarTemplates(): ThemeTemplateSummary[] {
  return THEME_TEMPLATES.map(({ id, nome, descricao, tokens }) => ({
    id,
    nome,
    descricao,
    cores: {
      primary: tokens.colors.primary,
      secondary: tokens.colors.secondary,
      accent: tokens.colors.accent,
    },
  }));
}

/** Busca um template pelo id. Retorna undefined se não encontrar. */
export function buscarTemplate(id: string): ThemeTemplate | undefined {
  return THEME_TEMPLATES.find((t) => t.id === id);
}
