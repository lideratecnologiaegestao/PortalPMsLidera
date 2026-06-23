import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/** DTO de criação de um conteúdo de conhecimento longo da IA. */
export class CriarConteudoDto {
  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  conteudo!: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsUUID()
  secretariaId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  publico?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /** ISO date string (yyyy-MM-dd) — opcional */
  @IsOptional()
  @IsDateString()
  vigenciaInicio?: string;

  /** ISO date string (yyyy-MM-dd) — opcional */
  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;
}

/** DTO de atualização parcial de conteúdo de conhecimento. */
export class AtualizarConteudoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  conteudo?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsUUID()
  secretariaId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  publico?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /** ISO date string (yyyy-MM-dd) — opcional */
  @IsOptional()
  @IsDateString()
  vigenciaInicio?: string;

  /** ISO date string (yyyy-MM-dd) — opcional */
  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;
}

/** Query params de listagem. */
export class ListarConteudosQuery {
  @IsOptional()
  @IsString()
  categoria?: string;

  /** UUID da secretaria para filtrar. */
  @IsOptional()
  @IsUUID()
  secretaria?: string;

  /** Termo de busca full-text. */
  @IsOptional()
  @IsString()
  q?: string;
}
