import { atendeNivel, maiorNivel, Nivel } from './confiabilidade';

describe('confiabilidade gov.br', () => {
  describe('atendeNivel', () => {
    it('aceita quando o nível do usuário >= mínimo exigido', () => {
      expect(atendeNivel(Nivel.OURO, Nivel.PRATA)).toBe(true);
      expect(atendeNivel(Nivel.PRATA, Nivel.PRATA)).toBe(true);
    });
    it('rejeita quando abaixo do mínimo ou desconhecido', () => {
      expect(atendeNivel(Nivel.BRONZE, Nivel.PRATA)).toBe(false);
      expect(atendeNivel(null, Nivel.BRONZE)).toBe(false);
      expect(atendeNivel(undefined, Nivel.PRATA)).toBe(false);
    });
  });

  describe('maiorNivel', () => {
    it('extrai o maior id de uma lista', () => {
      expect(maiorNivel([{ id: '1' }, { id: '3' }, { id: '2' }])).toBe(3);
    });
    it('aceita formato { niveis: [...] }', () => {
      expect(maiorNivel({ niveis: [{ id: 2 }, { id: 1 }] })).toBe(2);
    });
    it('ignora valores fora de 1..3 e retorna null quando vazio', () => {
      expect(maiorNivel([{ id: 9 }])).toBeNull();
      expect(maiorNivel([])).toBeNull();
      expect(maiorNivel(null)).toBeNull();
    });
  });
});
