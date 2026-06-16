import { randomBytes } from 'crypto';

/** Tipos de mídia (espelha o enum media_tipo do banco). */
export type MediaTipo = 'imagem' | 'documento' | 'video' | 'audio' | 'outro';

/** Escopo de visibilidade (espelha media_visibilidade). */
export type MediaVisibilidade = 'publico' | 'restrito';

/** Allowlist de MIME → tipo. Recusar o que não estiver aqui. */
const MIME_TIPO: Record<string, MediaTipo> = {
  'image/png': 'imagem',
  'image/jpeg': 'imagem',
  'image/webp': 'imagem',
  'image/gif': 'imagem',
  'image/svg+xml': 'imagem',
  'application/pdf': 'documento',
  'application/msword': 'documento',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documento',
  'application/vnd.ms-excel': 'documento',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'documento',
  'text/csv': 'documento',
  'application/zip': 'outro',
  'video/mp4': 'video',
  'audio/mpeg': 'audio',
};

export function mimeParaTipo(mime: string): MediaTipo | null {
  return MIME_TIPO[mime] ?? null;
}

export function ehImagem(mime: string): boolean {
  return mimeParaTipo(mime) === 'imagem';
}

/** Extensão a partir do MIME (fonte da verdade é o MIME validado, não o nome). */
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

export function extDoMime(mime: string): string {
  return MIME_EXT[mime] ?? 'bin';
}

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Nome mascarado (ex.: "09h7789ahhdiochdpaueh"). Aleatório, sem relação com
 * o nome original — é o que aparece na URL pública.
 */
export function gerarHash(tamanho = 21): string {
  const bytes = randomBytes(tamanho);
  let out = '';
  for (let i = 0; i < tamanho; i++) out += BASE62[bytes[i] % 62];
  return out;
}

/**
 * Caminho REAL no storage — NUNCA exposto ao cliente.
 * Ex.: {tenant}/imagem/logos/09h7789ahhdiochdpaueh.svg
 */
export function montarStorageKey(p: {
  tenantId: string;
  tipo: MediaTipo;
  categoriaSlug: string;
  hash: string;
  ext: string;
}): string {
  return `${p.tenantId}/${p.tipo}/${p.categoriaSlug}/${p.hash}.${p.ext}`;
}

/**
 * URL pública MASCARADA (só p/ visibilidade 'publico'). Servida pelo backend,
 * fora do prefixo /api: /midia/[tipo]/[categoria]/[hash].[ext]
 */
export function montarUrlPublica(p: {
  tipo: MediaTipo;
  categoriaSlug: string;
  hash: string;
  ext: string;
}): string {
  return `/midia/${p.tipo}/${p.categoriaSlug}/${p.hash}.${p.ext}`;
}
