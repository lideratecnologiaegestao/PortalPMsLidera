import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash de senha para login local de servidores/admin (alternativa ao gov.br).
 * scrypt (nativo do Node — sem dependência externa). Formato: `salt:derivado`
 * em hexadecimal. Comparação timing-safe.
 */
export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(senha, salt, 64);
  return `${salt.toString('hex')}:${dk.toString('hex')}`;
}

export function verificarSenha(senha: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const [saltHex, dkHex] = hash.split(':');
  if (!saltHex || !dkHex) return false;
  try {
    const dk = scryptSync(senha, Buffer.from(saltHex, 'hex'), 64);
    const esperado = Buffer.from(dkHex, 'hex');
    return esperado.length === dk.length && timingSafeEqual(esperado, dk);
  } catch {
    return false;
  }
}
