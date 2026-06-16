// Fetcher educado para o site de origem: User-Agent identificavel, rate limit
// (concorrencia 1 + atraso) e cache em disco do HTML cru (migration/cache/).
// Re-execucoes NAO batem de novo no site (idempotencia da raspagem).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = join(ROOT, 'cache');

export const ORIGEM = 'https://www.baraodemelgaco.mt.gov.br';
const UA = 'LideraMigracao/1.0 (+migracao portal Barao de Melgaco; contato lideraabrange@gmail.com)';
const DELAY_MS = 1200; // atraso entre requisicoes (rate limit gentil)

let ultimo = 0;
async function gentil() {
  const agora = Date.now();
  const espera = Math.max(0, DELAY_MS - (agora - ultimo));
  if (espera) await new Promise((r) => setTimeout(r, espera));
  ultimo = Date.now();
}

function cachePath(url) {
  const h = createHash('sha1').update(url).digest('hex');
  return join(CACHE_DIR, `${h}.html`);
}

async function existe(p) {
  try { await access(p); return true; } catch { return false; }
}

/** GET com cache em disco. force=true ignora cache. Retorna { html, fromCache }. */
export async function getHtml(url, { force = false } = {}) {
  const p = cachePath(url);
  if (!force && (await existe(p))) {
    return { html: await readFile(p, 'utf8'), fromCache: true };
  }
  await gentil();
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const html = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(p, html, 'utf8');
  return { html, fromCache: false };
}

/** Download binario (PDF/imagem) com cache. Retorna { buffer, contentType, fromCache }. */
export async function getBinary(url, { force = false } = {}) {
  const h = createHash('sha1').update(url).digest('hex');
  const p = join(CACHE_DIR, 'bin', h);
  const meta = `${p}.json`;
  if (!force && (await existe(p)) && (await existe(meta))) {
    const m = JSON.parse(await readFile(meta, 'utf8'));
    return { buffer: await readFile(p), contentType: m.contentType, nome: m.nome, fromCache: true };
  }
  await gentil();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`GET(bin) ${url} -> HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const nome = decodeURIComponent(url.split('/').pop().split('?')[0] || 'arquivo');
  await mkdir(join(CACHE_DIR, 'bin'), { recursive: true });
  await writeFile(p, buffer);
  await writeFile(meta, JSON.stringify({ contentType, nome, url }), 'utf8');
  return { buffer, contentType, nome, fromCache: false };
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
