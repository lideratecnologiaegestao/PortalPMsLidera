/**
 * Helper SERVER-ONLY para autenticação do Gerenciador da Plataforma.
 *
 * Importa next/headers (cookies + headers) — NÃO importe este módulo
 * em Client Components. Use lib/platform.ts para funções client-safe.
 */

import { cookies, headers } from 'next/headers';
import type { PlataformaUser } from './platform';

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Retorna o usuário de plataforma autenticado ou null.
 * Espelha getPerfil() de lib/auth.ts mas chama GET /api/_platform/auth/me.
 * Nunca cacheado (no-store): específico do usuário.
 */
export async function getPlataformaUser(): Promise<PlataformaUser | null> {
  const cookie = cookies().toString();
  if (!cookie) return null;
  const host = headers().get('host') ?? '';
  try {
    const res = await fetch(`${API}/api/_platform/auth/me`, {
      headers: { cookie, 'x-forwarded-host': host },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PlataformaUser;
  } catch {
    return null;
  }
}
