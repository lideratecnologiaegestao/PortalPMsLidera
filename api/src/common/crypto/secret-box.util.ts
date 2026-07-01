import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifra simétrica para segredos em repouso (senha SMTP, tokens WhatsApp, chaves
 * de IA e o certificado digital ICP-Brasil por tenant). AES-256-GCM.
 *
 * Chave: derivada de `SECRET_BOX_KEY` se definida (RECOMENDADO — chave dedicada,
 * rotacionável de forma independente do JWT), senão de `AUTH_JWT_SECRET` (compat).
 * Ambas vivem só no ambiente, nunca no banco → um vazamento do banco não revela
 * os segredos.
 *
 * A decifragem tenta TODAS as chaves conhecidas (dedicada + compat), então migrar
 * para uma `SECRET_BOX_KEY` dedicada NÃO quebra blobs já cifrados com o
 * `AUTH_JWT_SECRET` — basta manter ambas as variáveis durante a transição.
 *
 * ⚠️ ROTAÇÃO: trocar a chave que CIFRA torna blobs antigos ilegíveis a menos que
 * a chave anterior continue disponível numa das variáveis. Para trocar de fato,
 * mantenha a chave antiga durante a migração e re-grave os segredos (re-importe
 * o .pfx do certificado, re-salve as configs) com a nova chave.
 *
 * Formato: `enc:v1:iv.tag.ciphertext` (base64). Prefixo `enc:v1:` marca o esquema.
 */
const PREFIXO = 'enc:v1:';

function derivar(seg: string): Buffer {
  return createHash('sha256').update(seg).digest(); // 32 bytes
}

/** Chaves conhecidas em ordem de preferência: a 1ª CIFRA; todas DECIFRAM. */
function chaves(): Buffer[] {
  const segs = [process.env.SECRET_BOX_KEY, process.env.AUTH_JWT_SECRET, 'dev-only-insecure-key']
    .filter((s): s is string => !!s);
  const out: Buffer[] = [];
  const vistos = new Set<string>();
  for (const s of segs) {
    if (vistos.has(s)) continue;
    vistos.add(s);
    out.push(derivar(s));
  }
  return out.length ? out : [derivar('dev-only-insecure-key')];
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chaves()[0], iv);
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decifrar(blob: string): string {
  if (!blob.startsWith(PREFIXO)) return blob; // compat: valor em claro legado
  const [ivB, tagB, encB] = blob.slice(PREFIXO.length).split('.');
  const iv = Buffer.from(ivB, 'base64');
  const tag = Buffer.from(tagB, 'base64');
  const enc = Buffer.from(encB, 'base64');
  let ultimoErro: unknown;
  for (const k of chaves()) {
    try {
      const d = createDecipheriv('aes-256-gcm', k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
    } catch (e) {
      ultimoErro = e; // chave não confere (tag inválida) → tenta a próxima
    }
  }
  throw ultimoErro ?? new Error('Falha ao decifrar: nenhuma chave compatível.');
}
