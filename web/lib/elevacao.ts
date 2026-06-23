/**
 * Helpers de fetch para solicitações de elevação de papel.
 * Usado tanto pela área do cidadão quanto pelo admin e pelo gerenciador.
 * Fala somente com a API (fronteira de camadas).
 */
import { adminGet, adminPost, qs } from './admin-api';
import { apiBase } from './auth-shared';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PapelSolicitado =
  | 'servidor'
  | 'gestor'
  | 'ouvidor'
  | 'assistente_ouvidoria'
  | 'ti';

export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada' | 'expirada';

export interface SolicitacaoElevacao {
  id: string;
  papelSolicitado: PapelSolicitado;
  cargoDeclarado: string | null;
  justificativa: string | null;
  status: StatusSolicitacao;
  motivoRecusa: string | null;
  criadoEm: string;
  atualizadoEm: string;
  solicitante?: {
    id: string;
    nome: string;
    email: string;
  };
  lotacaoSecretaria?: {
    id: string;
    nome: string;
  } | null;
  tenant?: {
    id: string;
    nome: string;
    slug: string;
  };
}

export interface SecretariaOpcao {
  id: string;
  nome: string;
}

// ─── Labels públicos ──────────────────────────────────────────────────────────

export const PAPEL_LABEL: Record<PapelSolicitado, string> = {
  servidor: 'Servidor',
  gestor: 'Gestor de conteúdo',
  ouvidor: 'Ouvidor',
  assistente_ouvidoria: 'Assistente de Ouvidoria',
  ti: 'TI (Tecnologia da Informação)',
};

export const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
};

export const STATUS_COR: Record<StatusSolicitacao, string> = {
  pendente: 'bg-warning/20 text-fg',
  aprovada: 'bg-success/20 text-success',
  recusada: 'bg-danger/10 text-danger',
  expirada: 'bg-muted text-fg/50',
};

// ─── Papéis que o admin_prefeitura/gestor pode aprovar ───────────────────────
export const PAPEIS_ADMIN_PREFEITURA: PapelSolicitado[] = ['servidor', 'gestor'];
/** Papéis aprovados exclusivamente pela equipe Lidera (super_admin). */
export const PAPEIS_LIDERA: PapelSolicitado[] = ['ouvidor', 'assistente_ouvidoria', 'ti'];

// ─── Funções do cidadão (autenticado, sem admin) ──────────────────────────────

/** Envia solicitação de elevação de papel. */
export async function solicitarElevacao(body: {
  papelSolicitado: PapelSolicitado;
  cargoDeclarado?: string;
  lotacaoSecretariaId?: string;
  justificativa?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${apiBase}/api/auth/solicitar-elevacao`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as { message?: string | string[] })?.message;
    throw new Error(Array.isArray(m) ? m.join('; ') : String(m ?? `Erro ${res.status}`));
  }
  return data as { id: string };
}

/** Lista as próprias solicitações do usuário logado. */
export async function minhasSolicitacoes(): Promise<SolicitacaoElevacao[]> {
  const res = await fetch(`${apiBase}/api/auth/minhas-solicitacoes`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json();
}

/** Busca secretarias públicas do tenant para o select de lotação. */
export async function getSecretariasCidadao(): Promise<SecretariaOpcao[]> {
  const res = await fetch(`${apiBase}/api/secretarias`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  // A API pode retornar array ou { items: [...] }
  const arr: { id: string; nome: string }[] = Array.isArray(data) ? data : (data.items ?? []);
  return arr.map((s) => ({ id: s.id, nome: s.nome }));
}

// ─── Funções do admin_prefeitura / gestor ─────────────────────────────────────

export const listarSolicitacoesAdmin = (status?: string) =>
  adminGet<SolicitacaoElevacao[]>(
    `/api/admin/elevation-requests${qs({ status: status || undefined })}`,
  );

export const aprovarSolicitacaoAdmin = (id: string) =>
  adminPost<void>(`/api/admin/elevation-requests/${id}/aprovar`);

export const recusarSolicitacaoAdmin = (id: string, motivo: string) =>
  adminPost<void>(`/api/admin/elevation-requests/${id}/recusar`, { motivo });

// ─── Funções do super_admin (cross-tenant) ───────────────────────────────────

export const listarSolicitacoesPlataforma = (status?: string) =>
  adminGet<SolicitacaoElevacao[]>(
    `/api/_platform/elevation-requests${qs({ status: status || undefined })}`,
  );

export const aprovarSolicitacaoPlataforma = (id: string) =>
  adminPost<void>(`/api/_platform/elevation-requests/${id}/aprovar`);

export const recusarSolicitacaoPlataforma = (id: string, motivo: string) =>
  adminPost<void>(`/api/_platform/elevation-requests/${id}/recusar`, { motivo });
