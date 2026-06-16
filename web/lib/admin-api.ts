// Helper de fetch autenticado para as telas do painel /admin (Client Components).
// O cookie de sessao HttpOnly e enviado pelo browser (credentials:'include');
// apiBase e relativo em producao (passa pelo Nginx -> portal-api).
import { apiBase } from './auth-shared';

export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Erro de API com a mensagem amigavel ja extraida do corpo. */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : j.message;
    } catch {
      /* corpo nao-JSON */
    }
    throw new AdminApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const adminGet = <T>(path: string) => req<T>('GET', path);
export const adminPost = <T>(path: string, body?: unknown) => req<T>('POST', path, body);
export const adminPut = <T>(path: string, body?: unknown) => req<T>('PUT', path, body);
export const adminPatch = <T>(path: string, body?: unknown) => req<T>('PATCH', path, body);
export const adminDelete = <T>(path: string) => req<T>('DELETE', path);

/**
 * Baixa um arquivo de um endpoint autenticado (cookie HttpOnly) e dispara o
 * "salvar como" no browser. Usado para downloads que exigem sessão (ex.: PDF da
 * documentação LGPD), onde um <a href> simples não levaria o cookie cross-site.
 */
export async function adminDownload(path: string, fallbackName = 'download'): Promise<void> {
  const res = await fetch(`${apiBase}${path}`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* */ }
    throw new AdminApiError(msg, res.status);
  }
  const disp = res.headers.get('Content-Disposition') ?? '';
  const m = /filename="?([^"]+)"?/.exec(disp);
  const nome = m?.[1] ?? fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Constroi querystring ignorando valores vazios/undefined. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
