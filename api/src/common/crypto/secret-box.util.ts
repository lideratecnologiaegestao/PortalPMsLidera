import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifra simétrica para segredos em repouso (ex.: senha de SMTP por tenant).
 * AES-256-GCM com chave derivada do AUTH_JWT_SECRET (que vive só no ambiente,
 * nunca no banco) — assim um vazamento do banco não revela os segredos.
 * Formato: `iv.tag.ciphertext` (base64). Prefixo `enc:v1:` marca o esquema.
 */
const PREFIXO = 'enc:v1:';

function chave(): Buffer {
  const seg = process.env.AUTH_JWT_SECRET || 'dev-only-insecure-key';
  return createHash('sha256').update(seg).digest(); // 32 bytes
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decifrar(blob: string): string {
  if (!blob.startsWith(PREFIXO)) return blob; // compat: valor em claro legado
  const [ivB, tagB, encB] = blob.slice(PREFIXO.length).split('.');
  const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
}
