// Cliente do cadastro/login do CIDADÃO sem gov.br (Client Components).
// Fala só com a API (mesma origem); o login seta o cookie de sessão (HttpOnly).
import { apiBase } from './auth-shared';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}/api/auth/cidadao${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as any)?.message;
    throw new Error(Array.isArray(m) ? m.join('; ') : String(m ?? `Erro ${res.status}`));
  }
  return data as T;
}

export const cadastrar = (d: {
  nome: string;
  email: string;
  telefone?: string;
  senha: string;
  turnstileToken?: string;
}) =>
  post<{
    precisaVerificar: { email: boolean; telefone: boolean };
    emailEnviado: boolean;
    telefoneEnviado: boolean;
  }>('/cadastro', d);

/**
 * Autocadastro público via `POST /api/auth/registrar` (ADR-0005 Fase 2).
 * Cria conta com papel `cidadao`. Não exige verificação de e-mail prévia.
 */
export async function registrar(d: {
  nome: string;
  email: string;
  senha: string;
  turnstileToken?: string;
}): Promise<{ id: string; role: string }> {
  const res = await fetch(`${apiBase}/api/auth/registrar`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as any)?.message;
    throw new Error(Array.isArray(m) ? m.join('; ') : String(m ?? `Erro ${res.status}`));
  }
  return data as { id: string; role: string };
}

export const verificar = (email: string, finalidade: 'email' | 'telefone', codigo: string) =>
  post<{ ok: boolean }>('/verificar', { email, finalidade, codigo });

export const reenviar = (email: string, finalidade: 'email' | 'telefone') =>
  post<{ ok: boolean }>('/reenviar', { email, finalidade });

export const login = (email: string, senha: string, turnstileToken?: string) =>
  post<{ ok: boolean; user: { id: string; nome: string } }>(
    '/login',
    { email, senha, ...(turnstileToken ? { turnstileToken } : {}) },
  );

export const recuperar = (email: string) => post<{ ok: boolean }>('/recuperar', { email });

export const redefinir = (email: string, codigo: string, novaSenha: string) =>
  post<{ ok: boolean }>('/redefinir', { email, codigo, novaSenha });

/**
 * Retorna dados básicos do usuário autenticado (cookie HttpOnly).
 * Usado pelo Client Component de comentários para detectar login.
 * Retorna null se não logado (401) ou em caso de erro.
 *
 * Reutiliza GET /api/auth/govbr/me (endpoint universal: funciona para cidadão,
 * servidor, gov.br — qualquer sessão com cookie válido).
 * O campo `nome` vem de `GET /api/auth/me/perfil` (retorna { nome, email, … }).
 * Para simplificar usamos apenas /me que retorna { id, role, tenantId, nivel }.
 * O nome do usuário logado não é necessário no widget de comentários (só id
 * é suficiente para saber se está logado; o backend usa a sessão para o autor).
 */
export async function getPerfilCidadao(): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${apiBase}/api/auth/govbr/me`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    // O endpoint retorna { id, role, tenantId, nivel }
    if (!data?.id) return null;
    return { id: data.id };
  } catch {
    return null;
  }
}
