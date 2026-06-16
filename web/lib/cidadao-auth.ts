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

export const cadastrar = (d: { nome: string; email: string; telefone?: string; senha: string }) =>
  post<{ precisaVerificar: { email: boolean; telefone: boolean }; emailEnviado: boolean; telefoneEnviado: boolean }>('/cadastro', d);

export const verificar = (email: string, finalidade: 'email' | 'telefone', codigo: string) =>
  post<{ ok: boolean }>('/verificar', { email, finalidade, codigo });

export const reenviar = (email: string, finalidade: 'email' | 'telefone') =>
  post<{ ok: boolean }>('/reenviar', { email, finalidade });

export const login = (email: string, senha: string) =>
  post<{ ok: boolean; user: { id: string; nome: string } }>('/login', { email, senha });

export const recuperar = (email: string) => post<{ ok: boolean }>('/recuperar', { email });

export const redefinir = (email: string, codigo: string, novaSenha: string) =>
  post<{ ok: boolean }>('/redefinir', { email, codigo, novaSenha });
