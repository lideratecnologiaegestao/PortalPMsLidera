import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../common/rbac/roles.enum';

/**
 * Papéis que podem ser solicitados via autocadastro.
 *
 * ADR-0005: super_admin, admin_prefeitura e cidadao NUNCA podem ser
 * solicitados via elevation_requests. ouvidor/assistente_ouvidoria/ti
 * somente via super_admin (aprovados em /_platform).
 */
export const PAPEIS_ELEVAVEIS = [
  Role.OUVIDOR,
  Role.ASSISTENTE_OUVIDORIA,
  Role.TI,
  Role.GESTOR,
  Role.SERVIDOR,
] as const;

/** Papéis aprovados pelo admin_prefeitura/gestor (painel admin do tenant). */
export const PAPEIS_ADMIN_TENANT = [Role.GESTOR, Role.SERVIDOR] as const;

/** Papéis aprovados somente pelo super_admin (Gerenciador /_platform). */
export const PAPEIS_SUPER_ADMIN = [
  Role.OUVIDOR,
  Role.ASSISTENTE_OUVIDORIA,
  Role.TI,
] as const;

export type PapelElevavel = (typeof PAPEIS_ELEVAVEIS)[number];

export class SolicitarElevacaoDto {
  @IsEnum(PAPEIS_ELEVAVEIS, {
    message: `papelSolicitado deve ser um de: ${PAPEIS_ELEVAVEIS.join(', ')}`,
  })
  papelSolicitado!: PapelElevavel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cargoDeclarado?: string;

  @IsOptional()
  @IsUUID()
  lotacaoSecretariaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificativa?: string;
}

export class RecusarElevacaoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
