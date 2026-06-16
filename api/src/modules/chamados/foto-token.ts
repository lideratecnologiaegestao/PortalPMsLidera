import { SignJWT, jwtVerify } from 'jose';
import { sessionSecret } from '../auth/govbr.config';

/**
 * Token assinado de curta duração para acessar a foto de um chamado (DPIA):
 * a `storage_key` nunca aparece em resposta de API — só uma URL assinada com
 * TTL. O serving valida o token antes de transmitir os bytes.
 */
const TYP = 'chamado+foto';

export async function signFoto(fotoId: string): Promise<string> {
  return new SignJWT({ fid: fotoId })
    .setProtectedHeader({ alg: 'HS256', typ: TYP })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(sessionSecret());
}

export async function verifyFoto(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { typ: TYP });
    return typeof payload.fid === 'string' ? payload.fid : null;
  } catch {
    return null;
  }
}
