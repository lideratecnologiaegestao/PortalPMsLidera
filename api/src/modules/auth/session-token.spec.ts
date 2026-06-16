import { signSession, verifySession, signTx, verifyTx } from './session-token';

// segredo de teste (>= 32 chars) — o config exige isso
process.env.AUTH_JWT_SECRET =
  'segredo-de-teste-com-mais-de-32-caracteres-xyz';

describe('session-token (JWT próprio do backend)', () => {
  it('assina e valida a sessão (round-trip)', async () => {
    const { token, jti } = await signSession({
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'cidadao',
      nivel: 2,
    });
    expect(typeof token).toBe('string');
    expect(typeof jti).toBe('string');
    expect(jti).toMatch(/^[0-9a-f-]{36}$/); // UUID v4

    const claims = await verifySession(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.tenantId).toBe('tenant-1');
    expect(claims.role).toBe('cidadao');
    expect(claims.nivel).toBe(2);
    expect(claims.jti).toBe(jti); // jti incluso nas claims
  });

  it('rejeita token adulterado', async () => {
    const { token } = await signSession({
      sub: 'u',
      tenantId: 't',
      role: 'cidadao',
      nivel: null,
    });
    const adulterado = token.slice(0, -3) + 'aaa';
    await expect(verifySession(adulterado)).rejects.toBeDefined();
  });

  it('rejeita token assinado com outro segredo', async () => {
    const { token } = await signSession({
      sub: 'u',
      tenantId: 't',
      role: 'cidadao',
      nivel: null,
    });
    process.env.AUTH_JWT_SECRET = 'OUTRO-segredo-com-mais-de-32-caracteres-zzz';
    await expect(verifySession(token)).rejects.toBeDefined();
    // restaura para os demais testes
    process.env.AUTH_JWT_SECRET =
      'segredo-de-teste-com-mais-de-32-caracteres-xyz';
  });

  it('tx round-trip preserva state/nonce/verifier/redirect', async () => {
    const tx = {
      state: 's',
      nonce: 'n',
      codeVerifier: 'v',
      redirect: '/painel',
    };
    expect(await verifyTx(await signTx(tx))).toMatchObject(tx);
  });

  it('gera jti diferente a cada chamada', async () => {
    const a = await signSession({ sub: 'u', tenantId: 't', role: 'cidadao', nivel: null });
    const b = await signSession({ sub: 'u', tenantId: 't', role: 'cidadao', nivel: null });
    expect(a.jti).not.toBe(b.jti);
  });

  it('preserva o jti passado explicitamente', async () => {
    const { jti: jti1 } = await signSession({ sub: 'u', tenantId: 't', role: 'cidadao', nivel: null });
    const { token: t2, jti: jti2 } = await signSession({ sub: 'u', tenantId: 't', role: 'cidadao', nivel: null, jti: jti1 });
    expect(jti2).toBe(jti1);
    const claims = await verifySession(t2);
    expect(claims.jti).toBe(jti1);
  });
});
