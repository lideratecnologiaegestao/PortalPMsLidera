import {
  base64url,
  codeChallengeS256,
  generatePkce,
  randomToken,
} from './pkce.util';
import { createHash } from 'node:crypto';

describe('PKCE', () => {
  it('base64url não tem +, / ou padding', () => {
    const out = base64url(Buffer.from([251, 252, 253, 254, 255]));
    expect(out).not.toMatch(/[+/=]/);
  });

  it('code_challenge = BASE64URL(SHA256(verifier)) (S256)', () => {
    const verifier = 'verifier-de-teste-123';
    const esperado = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(codeChallengeS256(verifier)).toBe(esperado);
  });

  it('generatePkce produz state/nonce/verifier distintos e challenge coerente', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).toBe(codeChallengeS256(a.codeVerifier));
  });

  it('randomToken gera valores únicos', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken(16)));
    expect(tokens.size).toBe(50);
  });
});
