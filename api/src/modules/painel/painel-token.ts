import { SignJWT, jwtVerify } from 'jose';
import { sessionSecret } from '../auth/govbr.config';

/**
 * Token de PAINEL (modo TV/kiosk). A TV da sala do ouvidor/prefeito carrega o
 * dashboard com esse token na URL — sem login humano. Read-only, escopo de
 * tenant + painel, validade longa (a TV fica ligada). `typ` distinto impede que
 * vire token de sessão.
 */
export interface PainelClaims {
  tenantId: string;
  painel: 'ouvidoria' | 'prefeito';
}

const TYP_PAINEL = 'portal+painel';
const PAINEL_TTL = '180d';

export async function signPainel(claims: PainelClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: TYP_PAINEL })
    .setIssuedAt()
    .setExpirationTime(PAINEL_TTL)
    .sign(sessionSecret());
}

export async function verifyPainel(token: string): Promise<PainelClaims | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { typ: TYP_PAINEL });
    if (typeof payload.tenantId !== 'string' || typeof (payload as any).painel !== 'string') return null;
    return payload as unknown as PainelClaims;
  } catch {
    return null;
  }
}
