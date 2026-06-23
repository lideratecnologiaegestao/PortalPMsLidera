// Cliente do chat interno (Client Components). Fala só com a API (mesma origem,
// cookie de sessão). Tempo real via socket.io sob /api/socket.io.
import { io, Socket } from 'socket.io-client';
import { apiBase } from './auth-shared';

export interface Conversa {
  id: string;
  tipo: 'dm' | 'grupo' | 'protocolo';
  titulo: string | null;
  manifestacaoId: string | null;
  avatar: string | null;
  online: boolean;
  ultimaMensagem: { texto: string; em: string } | null;
  naoLidas: number;
  atualizadoEm: string;
}

export interface Mensagem {
  id: string;
  conversaId: string;
  autorId: string | null;
  autorNome: string;
  autorAvatar: string | null;
  conteudo: string | null;
  excluido: boolean;
  editado: boolean;
  respondendoA: string | null;
  anexos: { nome: string; mime: string; idx: number }[];
  criadoEm: string;
}

export interface UsuarioInterno {
  id: string;
  nome: string;
  role: string;
  avatar: string | null;
  online: boolean;
  /** Verdadeiro quando a entrada representa o Assistente do Portal (bot de IA). */
  isBot?: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}/api/chat${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message); } catch { /* */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const getConversas = () => req<Conversa[]>('/conversas');
export const getUsuarios = (q?: string) => req<UsuarioInterno[]>(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const criarConversa = (body: { tipo: 'dm' | 'grupo'; titulo?: string; participantes: string[] }) =>
  req<{ id: string }>('/conversas', { method: 'POST', body: JSON.stringify(body) });
export const abrirProtocolo = (manifestacaoId: string) =>
  req<{ id: string; titulo: string | null }>(`/conversas/protocolo/${manifestacaoId}`, { method: 'POST' });
export const getHistorico = (id: string, before?: string) =>
  req<Mensagem[]>(`/conversas/${id}/mensagens${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const enviarMensagem = (id: string, conteudo: string, respondendoA?: string) =>
  req<Mensagem>(`/conversas/${id}/mensagens`, { method: 'POST', body: JSON.stringify({ conteudo, respondendoA }) });
export const marcarLido = (id: string) => req<{ ok: boolean }>(`/conversas/${id}/ler`, { method: 'POST' });

export async function enviarAnexo(id: string, file: File, conteudo?: string): Promise<Mensagem> {
  const form = new FormData();
  form.append('file', file);
  if (conteudo) form.append('conteudo', conteudo);
  const res = await fetch(`${apiBase}/api/chat/conversas/${id}/anexo`, { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<Mensagem>;
}

export async function definirAvatar(file: File): Promise<{ avatar: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase}/api/chat/me/avatar`, { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export const urlAnexo = (mensagemId: string, idx: number) => `${apiBase}/api/chat/anexo/${mensagemId}/${idx}`;
export const urlAvatar = (userId: string) => `${apiBase}/api/chat/avatar/${userId}`;

export function conectarSocket(): Socket {
  return io(apiBase || undefined, {
    path: '/api/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
