import { cookies, headers } from 'next/headers';

export interface CurrentUser {
  id: string;
  role: string;
  tenantId: string | null;
  nivel: number | null;
}

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  role: string;
  mfaHabilitado: boolean;
  govbrNivel: number | null;
}

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Usuário autenticado na request atual (ou null). Encaminha o cookie de sessão
 * HttpOnly para a API (`GET /api/auth/govbr/me`). Nunca cacheado (no-store):
 * é específico do usuário. Nenhum dado pessoal é trazido — só id/papel/nível,
 * o suficiente para a UI (minimização LGPD).
 *
 * Server-only (usa next/headers). Para helpers de client use lib/auth-shared.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookie = cookies().toString();
  if (!cookie) return null;
  const host = headers().get('host') ?? '';
  try {
    const res = await fetch(`${API}/api/auth/govbr/me`, {
      headers: { cookie, 'x-forwarded-host': host },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

/**
 * Perfil completo do usuário autenticado (ou null). Chama `GET /api/auth/me/perfil`.
 * Encaminha cookie de sessão e Host original. Nunca cacheado (no-store).
 *
 * Server-only (usa next/headers). Use nos layouts e pages de /admin.
 */
export async function getPerfil(): Promise<Perfil | null> {
  const cookie = cookies().toString();
  if (!cookie) return null;
  const host = headers().get('host') ?? '';
  try {
    const res = await fetch(`${API}/api/auth/me/perfil`, {
      headers: { cookie, 'x-forwarded-host': host },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Perfil;
  } catch {
    return null;
  }
}
