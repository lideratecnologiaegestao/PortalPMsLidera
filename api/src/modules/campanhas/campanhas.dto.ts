/**
 * DTOs para o módulo Campanhas.
 * Validação primária feita pelo validarConfig() em capabilities/validator.ts.
 * Aqui apenas os shapes de entrada HTTP (body das rotas admin).
 */

/** Status válidos para uma campanha. */
export type CampanhaStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'ended' | 'archived';

export const STATUS_VALIDOS: CampanhaStatus[] = [
  'draft',
  'scheduled',
  'active',
  'paused',
  'ended',
  'archived',
];

/** Body de POST /api/admin/campanhas (criação custom). */
export interface CriarCampanhaDto {
  nome: string;
  startsAt?: string | null;   // ISO 8601
  endsAt?: string | null;
  prioridade?: number;
  config?: Record<string, unknown>;
  recorrencia?: Record<string, unknown> | null;
}

/** Body de PUT /api/admin/campanhas/:id. */
export interface AtualizarCampanhaDto {
  nome?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  prioridade?: number;
  config?: Record<string, unknown>;
  recorrencia?: Record<string, unknown> | null;
}

/** Body de PATCH /api/admin/campanhas/:id/status. */
export interface SetStatusDto {
  status: CampanhaStatus;
}

/** Body de POST /api/admin/campanhas/instalar. */
export interface InstalarPresetDto {
  templateKey: string;
}
