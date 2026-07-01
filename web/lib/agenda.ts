// Client helpers + tipos da Agenda (Legislativa/Administrativa).
import { adminGet, adminPost, adminPut, adminDelete, qs } from './admin-api';

export type FonteAgenda = 'agenda' | 'sessao' | 'evento';

export interface AgendaItemView {
  id: string;
  fonte: FonteAgenda;
  editavel: boolean;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  link?: string | null;
  inicio: string; // ISO
  fim?: string | null;
  diaInteiro: boolean;
  cor?: string | null;
  destaque?: boolean;
  recorrencia?: string;
  publico?: boolean;
  timezone?: string;
}

export interface AgendaItem {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  link?: string | null;
  inicio: string;
  fim?: string | null;
  diaInteiro: boolean;
  timezone: string;
  cor?: string | null;
  recorrencia: string; // nenhuma | anual
  destaque: boolean;
  publico: boolean;
  ativo: boolean;
  ordem: number;
}

/** Tipos de item (municipais) + rótulo + cor padrão. */
export const TIPOS_AGENDA: { v: string; label: string; cor: string }[] = [
  { v: 'evento', label: 'Evento', cor: '#0d6efd' },
  { v: 'reuniao', label: 'Reunião', cor: '#20c997' },
  { v: 'audiencia_publica', label: 'Audiência Pública', cor: '#28a745' },
  { v: 'feriado', label: 'Feriado', cor: '#dc3545' },
  { v: 'ponto_facultativo', label: 'Ponto Facultativo', cor: '#fd7e14' },
  { v: 'data_comemorativa', label: 'Data Comemorativa', cor: '#6f42c1' },
  { v: 'programacao', label: 'Programação', cor: '#0dcaf0' },
  { v: 'prazo', label: 'Prazo', cor: '#ffc107' },
  { v: 'outro', label: 'Outro', cor: '#6c757d' },
];

const MAPA_TIPO = new Map(TIPOS_AGENDA.map((t) => [t.v, t]));
export function tipoLabel(tipo: string): string {
  return MAPA_TIPO.get(tipo)?.label ?? tipo;
}
export function corDoItem(it: { cor?: string | null; tipo: string }): string {
  return it.cor || MAPA_TIPO.get(it.tipo)?.cor || '#6c757d';
}

// ─── Admin ────────────────────────────────────────────────────────────────
/** Calendário do admin (inclui privados + overlays de sessões/eventos). */
export function agendaAdminIntervalo(de: string, ate: string, tipos?: string[]): Promise<AgendaItemView[]> {
  return adminGet<AgendaItemView[]>(`/api/admin/agenda${qs({ de, ate, tipos: tipos?.join(',') })}`);
}
/** Lista de gestão (itens próprios brutos, para editar). */
export function agendaItens(): Promise<AgendaItem[]> {
  return adminGet<AgendaItem[]>('/api/admin/agenda/itens');
}
export function criarAgendaItem(dto: Partial<AgendaItem>): Promise<AgendaItem> {
  return adminPost<AgendaItem>('/api/admin/agenda/itens', dto);
}
export function atualizarAgendaItem(id: string, dto: Partial<AgendaItem>): Promise<AgendaItem> {
  return adminPut<AgendaItem>(`/api/admin/agenda/itens/${id}`, dto);
}
export function excluirAgendaItem(id: string): Promise<void> {
  return adminDelete<void>(`/api/admin/agenda/itens/${id}`);
}
