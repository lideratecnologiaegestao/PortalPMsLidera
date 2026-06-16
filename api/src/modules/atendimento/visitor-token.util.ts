import { SignJWT, jwtVerify } from 'jose';
import { sessionSecret } from '../auth/govbr.config';

/** Claims do token de visitante de atendimento. */
export interface VisitorClaims {
  conversaId: string;
  tenantId: string;
  typ: 'atend+visitor';
}

const TYP_VISITOR = 'atend+visitor';
const TTL = '30m';

/**
 * Assina um token JWT de visitante para uma conversa de atendimento.
 * Usa o mesmo segredo AUTH_JWT_SECRET, mas typ distinto para não ser
 * aceito como sessão interna (e vice-versa).
 */
export async function assinarVisitante(conversaId: string, tenantId: string): Promise<string> {
  return new SignJWT({ conversaId, tenantId })
    .setProtectedHeader({ alg: 'HS256', typ: TYP_VISITOR })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(sessionSecret());
}

/** Verifica e retorna os claims do token de visitante. Lança em caso de falha. */
export async function verificarVisitante(token: string): Promise<VisitorClaims> {
  const { payload } = await jwtVerify(token, sessionSecret(), { typ: TYP_VISITOR });
  if (
    typeof payload['conversaId'] !== 'string' ||
    typeof payload['tenantId'] !== 'string'
  ) {
    throw new Error('Claims de visitante inválidos.');
  }
  return {
    conversaId: payload['conversaId'] as string,
    tenantId: payload['tenantId'] as string,
    typ: TYP_VISITOR,
  };
}
