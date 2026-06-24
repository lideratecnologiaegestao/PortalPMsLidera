/**
 * Guard de contraste WCAG AA (regra inviolável 3).
 * Calcula a luminância relativa (WCAG 2.1 §1.4.3) e a razão de contraste.
 * Razão mínima 4.5:1 para texto normal sobre fundo colorido.
 */

import { BadRequestException } from '@nestjs/common';

/** Parseia um hex (#rgb ou #rrggbb) para [r,g,b] ∈ [0,255]. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  throw new Error(`Cor hex inválida: "${hex}"`);
}

/** Luminância relativa WCAG 2.1. */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores (hex). Resultado ∈ [1, 21]. */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Retorna `#ffffff` ou `#000000`, o que tiver maior contraste com `bg`. */
export function deriveFg(bg: string): string {
  const withWhite = contrastRatio(bg, '#ffffff');
  const withBlack = contrastRatio(bg, '#000000');
  return withWhite >= withBlack ? '#ffffff' : '#000000';
}

/**
 * Valida o par corPrimaria + corPrimariaFg para WCAG AA (≥ 4.5:1).
 *
 * - Se `corPrimariaFg` omitido: deriva automaticamente (nunca rejeita).
 * - Se `corPrimariaFg` informado e o par reprovar: lança erro com mensagem clara.
 *
 * Retorna `{ corPrimaria, corPrimariaFg }` com fg garantidamente válido.
 */
export function validarContrasteWcagAA(
  corPrimaria: string,
  corPrimariaFg?: string,
): { corPrimaria: string; corPrimariaFg: string } {
  const LIMITE = 4.5;

  if (corPrimariaFg) {
    const ratio = contrastRatio(corPrimaria, corPrimariaFg);
    if (ratio < LIMITE) {
      throw new BadRequestException(
        `Contraste insuficiente entre corPrimaria "${corPrimaria}" e corPrimariaFg "${corPrimariaFg}": ` +
          `razão ${ratio.toFixed(2)}:1 (mínimo WCAG AA: ${LIMITE}:1). ` +
          `Omita corPrimariaFg para derivação automática.`,
      );
    }
    return { corPrimaria, corPrimariaFg };
  }

  // Deriva automaticamente
  return { corPrimaria, corPrimariaFg: deriveFg(corPrimaria) };
}
