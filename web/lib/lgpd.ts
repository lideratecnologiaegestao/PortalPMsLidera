// Helpers de cliente para LGPD — cidadão autenticado (cookie de sessão HttpOnly).
// Fala somente com a API (mesma origem atrás do Nginx); cookie enviado pelo browser.
import { apiBase } from './auth-shared';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SolicitacaoTipo =
  | 'confirmacao_existencia'
  | 'acesso'
  | 'correcao'
  | 'anonimizacao'
  | 'bloqueio'
  | 'eliminacao'
  | 'portabilidade'
  | 'info_compartilhamento'
  | 'revogacao_consentimento'
  | 'oposicao'
  | 'revisao_decisao_automatizada';

export type SolicitacaoStatus =
  | 'aberta'
  | 'em_andamento'
  | 'encaminhada'
  | 'concluida'
  | 'indeferida';

export interface SolicitacaoResumo {
  id: string;
  tipo: SolicitacaoTipo;
  descricao: string | null;
  status: SolicitacaoStatus;
  prazoEm: string;
  atrasada: boolean;
  resposta: string | null;
  indeferimentoMotivo: string | null;
  criadoEm: string;
}

export interface Encarregado {
  dpoNome: string | null;
  dpoEmail: string | null;
}

// ─── Labels amigáveis ────────────────────────────────────────────────────────

export const TIPO_LABEL: Record<SolicitacaoTipo, string> = {
  confirmacao_existencia: 'Confirmação de existência de tratamento',
  acesso: 'Acesso aos meus dados',
  correcao: 'Correção de dados',
  anonimizacao: 'Anonimização',
  bloqueio: 'Bloqueio de uso',
  eliminacao: 'Eliminação/Exclusão',
  portabilidade: 'Portabilidade',
  info_compartilhamento: 'Com quem meus dados foram compartilhados',
  revogacao_consentimento: 'Revogar consentimento',
  oposicao: 'Oposição ao tratamento',
  revisao_decisao_automatizada: 'Revisão de decisão automatizada',
};

export const STATUS_LABEL: Record<SolicitacaoStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  encaminhada: 'Encaminhada',
  concluida: 'Concluída',
  indeferida: 'Indeferida',
};

export const STATUS_COR: Record<SolicitacaoStatus, string> = {
  aberta: 'bg-primary/10 text-primary',
  em_andamento: 'bg-warning/20 text-warning',
  encaminhada: 'bg-secondary/10 text-secondary',
  concluida: 'bg-success/20 text-success',
  indeferida: 'bg-danger/10 text-danger',
};

// ─── Helpers de request ───────────────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* corpo não-JSON */
    }
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Endpoints do cidadão ─────────────────────────────────────────────────────

/** Lista solicitações do titular autenticado. */
export const listarSolicitacoes = () =>
  req<SolicitacaoResumo[]>('/api/lgpd/solicitacoes');

/** Cria nova solicitação. */
export const criarSolicitacao = (tipo: SolicitacaoTipo, descricao?: string) =>
  req<SolicitacaoResumo>('/api/lgpd/solicitacoes', {
    method: 'POST',
    body: JSON.stringify({ tipo, descricao: descricao?.trim() || undefined }),
  });

/** Retorna dados do encarregado (público, sem auth). */
export const getEncarregado = () =>
  req<Encarregado>('/api/lgpd/encarregado');

/**
 * Dispara o download do arquivo JSON de dados pessoais.
 * Usa fetch com credentials e cria um blob URL para download no browser.
 */
export async function baixarMeusDados(): Promise<void> {
  const res = await fetch(`${apiBase}/api/lgpd/meus-dados?formato=json`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
