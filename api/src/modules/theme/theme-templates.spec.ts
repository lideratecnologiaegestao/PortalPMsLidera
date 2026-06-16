/**
 * Valida que todos os 7 presets de tema passam na checagem WCAG AA.
 * Esta spec é obrigatória pela regra inviolável 3 (acessibilidade é lei).
 */

import { THEME_TEMPLATES } from './theme-templates';
import { validateThemeColors } from './contrast.util';

describe('THEME_TEMPLATES — WCAG AA compliance', () => {
  it('deve haver exatamente 7 presets', () => {
    expect(THEME_TEMPLATES).toHaveLength(7);
  });

  for (const template of THEME_TEMPLATES) {
    describe(`Preset "${template.id}" (${template.nome})`, () => {
      let report: ReturnType<typeof validateThemeColors>;

      beforeAll(() => {
        report = validateThemeColors(template.tokens.colors);
      });

      it('deve passar em todos os pares de contraste WCAG AA', () => {
        const reprovados = report.checks.filter((c) => !c.aprovado);
        if (reprovados.length > 0) {
          const detalhes = reprovados
            .map((c) => `  ${c.par}: ratio=${c.ratio} (exigido >=${c.exigido})`)
            .join('\n');
          throw new Error(
            `Preset "${template.id}" reprovado nos seguintes pares:\n${detalhes}`,
          );
        }
        expect(report.ok).toBe(true);
      });

      it('deve ter ratio fg/bg >= 7:1 (texto normal sobre fundo)', () => {
        const fgBg = report.checks.find((c) => c.par === 'fg sobre bg');
        expect(fgBg).toBeDefined();
        // #1B1B1B sobre #FFFFFF deve ser ~16:1 — bem acima do mínimo
        expect(fgBg!.ratio).toBeGreaterThanOrEqual(7);
      });

      it('deve ter ratio texto/primária >= 4.5:1', () => {
        const primaria = report.checks.find((c) => c.par === 'texto sobre primária');
        expect(primaria).toBeDefined();
        expect(primaria!.ratio).toBeGreaterThanOrEqual(4.5);
      });

      it('deve ter ratio primária/fundo >= 3:1 (elementos UI)', () => {
        const uiPrimaria = report.checks.find((c) => c.par === 'primária sobre fundo (UI)');
        expect(uiPrimaria).toBeDefined();
        expect(uiPrimaria!.ratio).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
