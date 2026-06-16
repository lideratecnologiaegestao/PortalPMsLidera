import { gerarSecret, gerarTotp, otpauthUrl, verificarTotp } from './totp';

describe('TOTP (MFA)', () => {
  it('round-trip: o código gerado verifica com o segredo', () => {
    const secret = gerarSecret();
    const codigo = gerarTotp(secret);
    expect(verificarTotp(secret, codigo)).toBe(true);
  });

  it('rejeita código errado', () => {
    const secret = gerarSecret();
    expect(verificarTotp(secret, '000000')).toBe(false);
  });

  it('rejeita código de outro segredo', () => {
    const a = gerarSecret();
    const b = gerarSecret();
    expect(verificarTotp(b, gerarTotp(a))).toBe(false);
  });

  it('otpauthUrl contém o emissor e a conta', () => {
    const url = otpauthUrl('servidor@cuiaba.gov.br', gerarSecret());
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(url)).toContain('Portal Prefeitura');
  });
});
