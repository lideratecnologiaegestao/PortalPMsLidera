import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export enum MenuLocalEnum {
  CABECALHO = 'cabecalho',
  RODAPE = 'rodape',
}

export enum MenuTipoEnum {
  INTERNO = 'interno',
  EXTERNO = 'externo',
  GRUPO = 'grupo',
}

export class CriarMenuItemDto {
  @IsEnum(MenuLocalEnum)
  local!: MenuLocalEnum;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsEnum(MenuTipoEnum)
  tipo!: MenuTipoEnum;

  /**
   * href é obrigatório quando tipo='interno' ou 'externo'.
   * Para tipo='grupo' é ignorado/não requerido.
   * NÃO usa @IsUrl pois pode ser rota relativa (ex.: /transparencia).
   */
  @ValidateIf((o) => o.tipo !== MenuTipoEnum.GRUPO)
  @IsString()
  @IsNotEmpty()
  href?: string;

  @IsString()
  @IsOptional()
  icone?: string;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}

export class AtualizarMenuItemDto {
  @IsUUID()
  @IsOptional()
  parentId?: string | null;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  label?: string;

  @IsEnum(MenuTipoEnum)
  @IsOptional()
  tipo?: MenuTipoEnum;

  /**
   * NÃO usa @IsUrl pois pode ser rota relativa (ex.: /secretarias#sec-123).
   */
  @IsString()
  @IsOptional()
  href?: string | null;

  @IsString()
  @IsOptional()
  icone?: string | null;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
