/**
 * Tipos e helpers para o módulo Atendimento Omnichannel.
 * Público: token de visitante (Bearer). Admin: cookie de sessão (credentials:include).
 * Fronteira de camadas: NUNCA acessa banco/storage diretamente — só via API.
 */

import { io, Socket } from 'socket.io-client';
import { apiBase } from './auth-shared';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface AtendimentoConfig {
  ativo: boolean;
  avisoLgpd?: string | null;
  saudacao?: string | null;
  expediente: Array<{
    diaSemana: number;
    horaInicio: string;
    horaFim: string;
    ativo: boolean;
  }>;
  dentroExpediente: boolean;
}

export type AtendStatusType = 'bot' | 'aguardando_agente' | 'em_atendimento' | 'encerrada';
export type AutorTipo = 'visitante' | 'bot' | 'agente' | 'sistema';
export type CanalTipo = 'widget' | 'whatsapp';

export interface MensagemAtend {
  id: string;
  autorTipo: AutorTipo;
  autorNome?: string | null;
  conteudo: string;
  interno?: boolean;
  criadoEm: string;
  /** Botões de resposta rápida (transientes, só via socket — ex.: menu de tipos). */
  opcoes?: { label: string; valor: string }[];
}

export interface ConversaPublica {
  id: string;
  token: string;
  status: AtendStatusType;
}

// ─── Tipos admin ──────────────────────────────────────────────────────────────

export interface ConversaLista {
  id: string;
  canal: CanalTipo;
  status: AtendStatusType;
  visitanteNome?: string | null;
  assunto?: string | null;
  secretariaNome?: string | null;
  agenteNome?: string | null;
  tagIds: string[];
  ultimaAtividadeEm: string;
  naoLidas?: number;
}

export interface ConversaDetalhe {
  conversa: {
    id: string;
    canal: CanalTipo;
    status: AtendStatusType;
    visitanteNome?: string | null;
    visitanteEmail?: string | null;
    visitanteTelefone?: string | null;
    assunto?: string | null;
    origemUrl?: string | null;
    secretariaId?: string | null;
    secretariaNome?: string | null;
    agenteId?: string | null;
    agenteNome?: string | null;
    tagIds: string[];
    iniciadaEm: string;
    encerradaEm?: string | null;
    ultimaAtividadeEm: string;
    /** Manifestação aberta a partir do chat (cross-link com a ouvidoria). */
    manifestacaoId?: string | null;
    manifestacaoProtocolo?: string | null;
  };
  mensagens: MensagemAtend[];
  eventos?: Array<{ id: string; tipo: string; criadoEm: string; payload?: unknown }>;
}

export interface AtendimentoTag {
  id: string;
  nome: string;
  cor: string;
}

export interface AtendimentoConfigAdmin {
  atendimentoHumanoAtivo: boolean;
  iaChatWidgetAtivo: boolean;
  atendimentoSaudacao?: string | null;
  atendimentoMensagemForaExp?: string | null;
  atendimentoAvisoLgpd?: string | null;
  atendimentoTimezone?: string | null;
  atendimentoInatividadeMin?: number | null;
  evolutionInstancia?: string | null;
}

export interface HorarioItem {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
}

// ─── API pública (token Bearer de visitante) ──────────────────────────────────

const API_PUBL = `${apiBase}/api/atendimento`;

async function reqPubl<T>(
  method: string,
  path: string,
  token?: string | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_PUBL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch { /* */ }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getAtendimentoConfig = () =>
  reqPubl<AtendimentoConfig>('GET', '/config');

export const iniciarConversa = (body: {
  nome?: string;
  email?: string;
  assunto?: string;
  secretariaId?: string;
  origemUrl?: string;
}) => reqPubl<ConversaPublica>('POST', '/conversas', null, body);

export const refreshTokenVisitante = (conversaId: string, token: string) =>
  reqPubl<{ token: string }>('GET', `/conversas/${conversaId}/token`, token);

export const enviarMensagemVisitante = (
  conversaId: string,
  token: string,
  conteudo: string,
) => reqPubl<void>('POST', `/conversas/${conversaId}/mensagens`, token, { conteudo });

export const getMensagensVisitante = (
  conversaId: string,
  token: string,
  before?: string,
) =>
  reqPubl<MensagemAtend[]>(
    'GET',
    `/conversas/${conversaId}/mensagens${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    token,
  );

// ─── Socket público (namespace /atendimento) ──────────────────────────────────

export function conectarSocketAtendimento(token: string): Socket {
  return io(`${apiBase || ''}/atendimento`, {
    path: '/api/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}

// ─── Socket admin (namespace /atendimento, cookie de sessão) ──────────────────

export function conectarSocketAtendimentoAdmin(): Socket {
  return io(`${apiBase || ''}/atendimento`, {
    path: '/api/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
