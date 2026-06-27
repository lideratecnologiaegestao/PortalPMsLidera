import { modalidadeLicitacao } from './aplic-tabelas.ref';

describe('modalidadeLicitacao', () => {
  it('mapeia códigos conhecidos', () => {
    expect(modalidadeLicitacao('13')).toBe('Pregão eletrônico (bens e serviços comuns)');
    expect(modalidadeLicitacao('08')).toBe('Dispensa de licitação');
    expect(modalidadeLicitacao('09')).toBe('Inexigibilidade de licitação');
  });
  it('normaliza para 2 dígitos (ex.: "8" → "08")', () => {
    expect(modalidadeLicitacao('8')).toBe('Dispensa de licitação');
  });
  it('código desconhecido vira rótulo genérico; nulo → null', () => {
    expect(modalidadeLicitacao('999')).toBe('Modalidade 999');
    expect(modalidadeLicitacao(null)).toBeNull();
    expect(modalidadeLicitacao('')).toBeNull();
  });
});
