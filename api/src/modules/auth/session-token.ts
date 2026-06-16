import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import { sessionSecret, SESSION_TTL } from './govbr.config';

/** Conteúdo do token de sessão emitido pelo NOSSO backend (não o id_token gov.br). */
export interface SessionClaims {
  sub: string; // users.id
  tenantId: string | null;
  role: string;
  nivel: number | null; // confiabilidade gov.br (1/2/3)
  mfa?: boolean; // true quando o 2º fator foi verificado nesta sessão
  jti?: string;  // ID único da sessão — permite revogação server-side
}

/** Conteúdo do cookie de transação OIDC (entre /login e /callback). */
export interface TxClaims {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirect: string;
}

// `typ` distintos impedem que um token de transação seja aceito como sessão
// (e vice-versa), mesmo compartilhando o segredo HS256.
const TYP_SESSION = 'portal+session';
const TYP_TX = 'govbr+tx';

export interface SignedSession {
  token: string;
  jti: string;
  /** Data de expiração calculada a partir de SESSION_TTL. */
  expiraEm: Date;
}

/**
 * Assina um token de sessão incluindo um jti (UUID v4) para revogação
 * server-side. Retorna { token, jti, expiraEm }.
 */
export async function signSession(claims: SessionClaims): Promise<SignedSession> {
  const jti = claims.jti ?? randomUUID();
  const expiraEm = calcularExpiracao(SESSION_TTL);
  // Remove jti dos claims para nao duplicar no payload (setJti o registra como claim padrao JWT)
  const { jti: _jtiOmit, ...restClaims } = claims;
  const token = await new SignJWT(restClaims as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256', typ: TYP_SESSION })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(SESSION_TTL)
    .sign(sessionSecret());
  return { token, jti, expiraEm };
}

export async function verifySession(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, sessionSecret(), { typ: TYP_SESSION });
  // validação de schema: claims obrigatórios precisam existir
  if (typeof payload.sub !== 'string' || typeof (payload as any).role !== 'string') {
    throw new Error('Claims de sessão inválidos.');
  }
  return payload as unknown as SessionClaims;
}

export async function signTx(claims: TxClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: TYP_TX })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(sessionSecret());
}

export async function verifyTx(token: string): Promise<TxClaims> {
  const { payload } = await jwtVerify(token, sessionSecret(), { typ: TYP_TX });
  return payload as unknown as TxClaims;
}

// ----------------------------------------------------------------- helpers

/**
 * Calcula a data de expiração a partir de uma string de TTL tipo "8h", "30m", "1d".
 * Fallback para 8 horas se o formato não for reconhecido.
 */
export function calcularExpiracao(ttl: string): Date {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    // Fallback seguro: 8 horas
    return new Date(Date.now() + 8 * 3600 * 1000);
  }
  const n = Number(match[1]);
  const unit = match[2];
  const ms = unit === 's' ? n * 1000
    : unit === 'm' ? n * 60 * 1000
    : unit === 'h' ? n * 3600 * 1000
    : n * 86400 * 1000; // 'd'
  return new Date(Date.now() + ms);
}
