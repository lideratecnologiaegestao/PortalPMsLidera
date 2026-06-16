/**
 * Contraste WCAG 2.1 — usado para impedir que uma prefeitura escolha cores
 * que quebrem a acessibilidade legal do portal (obrigatória para site público).
 *
 * Regras AA: texto normal >= 4.5:1, texto grande/UI >= 3.0:1.
 */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Razão de contraste entre duas cores hex (1..21). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(hexToRgb(fg));
  const l2 = relativeLuminance(hexToRgb(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastCheck {
  par: string;
  ratio: number;
  exigido: number;
  aprovado: boolean;
}

export interface WcagReport {
  ok: boolean;
  checks: ContrastCheck[];
}

/**
 * Valida os pares de cor críticos de um tema. Recebe o objeto `colors`.
 * Pares avaliados: texto principal sobre fundo, texto sobre botão primário, etc.
 */
export function validateThemeColors(colors: Record<string, string>): WcagReport {
  const pares: Array<[string, string, string, number]> = [
    ['fg sobre bg', colors.fg, colors.bg, 4.5],
    ['texto sobre primária', colors.primaryFg, colors.primary, 4.5],
    ['texto sobre secundária', colors.secondaryFg, colors.secondary, 4.5],
    ['primária sobre fundo (UI)', colors.primary, colors.bg, 3.0],
  ];

  const checks: ContrastCheck[] = pares
    .filter(([, fg, bg]) => fg && bg)
    .map(([par, fg, bg, exigido]) => {
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      return { par, ratio, exigido, aprovado: ratio >= exigido };
    });

  return { ok: checks.every((c) => c.aprovado), checks };
}
