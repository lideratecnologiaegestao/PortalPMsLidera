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

// Roles permitidas ao criar/editar via API de admin — SUPER_ADMIN é vedado.
const ROLES_PERMITIDAS = [
  Role.ADMIN_PREFEITURA,
  Role.GESTOR,
  Role.OUVIDOR,
  Role.SERVIDOR,
  Role.CIDADAO,
] as const;

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
