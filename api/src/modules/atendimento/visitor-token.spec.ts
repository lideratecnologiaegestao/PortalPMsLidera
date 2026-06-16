import { assinarVisitante, verificarVisitante } from './visitor-token.util';

/**
 * Testes unitários do utilitário de token de visitante.
 */
describe('visitor-token.util', () => {
  beforeAll(() => {
    // AUTH_JWT_SECRET precisa ter ≥32 chars
    process.env.AUTH_JWT_SECRET = 'test-secret-for-visitor-token-unit-tests-abc';
  });

  it('assina e verifica um token de visitante válido', async () => {
    const conversaId = 'conversa-uuid-123';
    const tenantId = 'tenant-uuid-456';
    const token = await assinarVisitante(conversaId, tenantId);
    expect(typeof token).toBe('string');

    const claims = await verificarVisitante(token);
    expect(claims.conversaId).toBe(conversaId);
    expect(claims.tenantId).toBe(tenantId);
    expect(claims.typ).toBe('atend+visitor');
  });

  it('rejeita token de sessão como token de visitante', async () => {
    // Um token HS256 com typ diferente não deve ser aceito
    const { signSession } = await import('../auth/session-token');
    const sessionToken = (
      await signSession({
        sub: 'user-1',
        tenantId: 'tenant-1',
        role: 'servidor',
        nivel: null,
      })
    ).token;

    await expect(verificarVisitante(sessionToken)).rejects.toThrow();
  });

  it('rejeita token com conversaId adulterado (assinatura inválida)', async () => {
    const token = await assinarVisitante('conversa-original', 'tenant-1');
    // Adultera o payload (parte central do JWT)
    const partes = token.split('.');
    // modifica o payload bruto
    const payloadOriginal = Buffer.from(partes[1], 'base64url').toString('utf-8');
    const payloadAdulterado = payloadOriginal.replace('conversa-original', 'conversa-adulterada');
    const tokenAdulterado = `${partes[0]}.${Buffer.from(payloadAdulterado).toString('base64url')}.${partes[2]}`;

    await expect(verificarVisitante(tokenAdulterado)).rejects.toThrow();
  });
});
