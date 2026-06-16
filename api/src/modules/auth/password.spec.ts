import { hashSenha, verificarSenha } from './password';

describe('password (scrypt)', () => {
  it('verifica a senha correta', () => {
    const h = hashSenha('Senha@Forte123');
    expect(verificarSenha('Senha@Forte123', h)).toBe(true);
  });
  it('rejeita senha errada', () => {
    const h = hashSenha('Senha@Forte123');
    expect(verificarSenha('errada', h)).toBe(false);
  });
  it('rejeita hash inválido/ausente', () => {
    expect(verificarSenha('x', null)).toBe(false);
    expect(verificarSenha('x', 'lixo')).toBe(false);
  });
  it('hashes do mesmo texto são diferentes (salt aleatório)', () => {
    expect(hashSenha('a')).not.toBe(hashSenha('a'));
  });
});
