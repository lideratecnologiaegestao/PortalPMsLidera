import { createHash, randomBytes } from 'node:crypto';

/** base64url sem padding (RFC 7636). */
export function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Valor aleatório base64url — usado para state, nonce e code_verifier. */
export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/** code_challenge = BASE64URL(SHA256(code_verifier)) — PKCE S256. */
export function codeChallengeS256(codeVerifier: string): string {
  return base64url(createHash('sha256').update(codeVerifier).digest());
}

/** Gera o trio PKCE + anti-CSRF/replay (state, nonce). */
export function generatePkce() {
  const codeVerifier = randomToken(32);
  return {
    state: randomToken(32),
    nonce: randomToken(32),
    codeVerifier,
    codeChallenge: codeChallengeS256(codeVerifier),
  };
}
