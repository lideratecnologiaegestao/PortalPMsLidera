import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/rbac/roles.enum';

/**
 * Roles que um admin_prefeitura pode atribuir.
 * ADR-0005: ouvidor, assistente_ouvidoria e ti são papéis sensíveis —
 * somente o super_admin pode elevar um usuário a esses papéis.
 * super_admin também é vetado (como antes).
 */
export const ROLES_ADMIN_PODE_CRIAR = [
  Role.GESTOR,
  Role.SERVIDOR,
  Role.CIDADAO,
] as const;

/**
 * Roles que o super_admin (via Gerenciador) pode criar/elevar.
 * Inclui todos exceto super_admin (que só existe na plataforma).
 */
export const ROLES_PLATAFORMA_PODE_CRIAR = [
  Role.ADMIN_PREFEITURA,
  Role.GESTOR,
  Role.OUVIDOR,
  Role.ASSISTENTE_OUVIDORIA,
  Role.SERVIDOR,
  Role.TI,
  Role.CIDADAO,
] as const;

/** União de todas as roles que podem ser atribuídas via API (exceto super_admin). */
export const ROLES_PERMITIDAS = ROLES_PLATAFORMA_PODE_CRIAR;
export type RolePermitida = (typeof ROLES_PERMITIDAS)[number];

export class CriarUserDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsEmail()
  email!: string;

  @IsEnum(ROLES_PERMITIDAS, {
    message: 'Role inválida. super_admin não pode ser atribuído via API.',
  })
  role!: RolePermitida;

  @IsString()
  @MinLength(8)
  senhaProvisoria!: string;
}

export class AtualizarUserDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nome?: string;

  @IsEnum(ROLES_PERMITIDAS, {
    message: 'Role inválida. super_admin não pode ser atribuído via API.',
  })
  @IsOptional()
  role?: RolePermitida;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;

  @IsUUID()
  @IsOptional()
  secretariaId?: string;
}
