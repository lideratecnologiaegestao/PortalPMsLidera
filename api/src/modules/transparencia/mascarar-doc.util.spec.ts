import { mascararDocumento, mascararMatricula } from './mascarar-doc.util';

describe('mascararDocumento', () => {
  it('mascara CPF de 11 dígitos', () => {
    expect(mascararDocumento('12345678909')).toBe('***.456.789-**');
    expect(mascararDocumento('123.456.789-09')).toBe('***.456.789-**');
  });
  it('publica CNPJ de 14 dígitos formatado', () => {
    expect(mascararDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('retorna null para nulo, vazio ou inválido', () => {
    expect(mascararDocumento(null)).toBeNull();
    expect(mascararDocumento('')).toBeNull();
    expect(mascararDocumento('123')).toBeNull();
  });
});

describe('mascararMatricula', () => {
  it('mantém só os 4 últimos', () => {
    expect(mascararMatricula('00012345')).toBe('****2345');
  });
  it('mascara tudo se < 4 chars', () => {
    expect(mascararMatricula('12')).toBe('****');
    expect(mascararMatricula(null)).toBe('****');
  });
});
