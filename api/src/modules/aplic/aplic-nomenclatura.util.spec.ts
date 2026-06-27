import { exigirNomeCargaTce, parseNomeCargaTce } from './aplic-nomenclatura.util';

describe('aplic-nomenclatura (nomenclatura padrão TCE-MT)', () => {
  describe('parseNomeCargaTce — válidos', () => {
    it('carga mensal CT', () => {
      expect(parseNomeCargaTce('1112796CT202501.ZIP')).toEqual({
        ug: '1112796', modulo: 'CT', exercicio: 2025, competencia: '01',
      });
    });

    it('aceita caminho completo e minúsculas', () => {
      expect(parseNomeCargaTce('E:\\ENTIDADES\\PM\\2025\\1113190ct202612.zip')).toEqual({
        ug: '1113190', modulo: 'CT', exercicio: 2026, competencia: '12',
      });
    });

    it('tolera carimbo após a competência', () => {
      expect(parseNomeCargaTce('1112796PL202503_ABC123.ZIP')).toEqual({
        ug: '1112796', modulo: 'PL', exercicio: 2025, competencia: '03',
      });
    });

    it('outros módulos mensais (CC/FP/PA/PL/CP)', () => {
      for (const m of ['CC', 'FP', 'PA', 'PL', 'CP']) {
        expect(parseNomeCargaTce(`1112796${m}202506.ZIP`)?.modulo).toBe(m);
      }
    });

    it('cargas anuais por código (00/13/99)', () => {
      expect(parseNomeCargaTce('1112796002025.ZIP')).toEqual({
        ug: '1112796', modulo: 'ORCAMENTO', exercicio: 2025, competencia: null,
      });
      expect(parseNomeCargaTce('1112796132025.ZIP')?.modulo).toBe('ENCERRAMENTO');
      expect(parseNomeCargaTce('1112796992025.ZIP')?.modulo).toBe('CARGA_INICIAL');
    });
  });

  describe('parseNomeCargaTce — inválidos retornam null', () => {
    it.each([
      'qualquer-coisa.zip',
      'CT202501.ZIP', // sem UG
      '111279CT202501.ZIP', // UG com 6 dígitos
      '1112796XX202501.ZIP', // módulo inexistente
      '1112796CT2025.ZIP', // mensal sem competência
      '1112796CT202513.ZIP', // mês 13 inválido
      '1112796CT202500.ZIP', // mês 00 inválido
    ])('rejeita "%s"', (nome) => {
      expect(parseNomeCargaTce(nome)).toBeNull();
    });
  });

  describe('exigirNomeCargaTce', () => {
    it('lança erro orientativo para nome fora do padrão', () => {
      expect(() => exigirNomeCargaTce('arquivo.zip')).toThrow(/nomenclatura padrão do TCE/i);
    });
    it('retorna a meta para nome válido', () => {
      expect(exigirNomeCargaTce('1112796CT202501.ZIP').modulo).toBe('CT');
    });
  });
});
