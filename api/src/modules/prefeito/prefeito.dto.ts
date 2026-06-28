import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CriarPrefeitoDto {
  @IsString() @IsNotEmpty() nome!: string;
  @IsString() @IsOptional() @IsIn(['prefeito', 'vice', 'primeira_dama']) tipo?: string;
  @IsString() @IsOptional() @IsIn(['masculino', 'feminino']) genero?: string;
  @IsString() @IsOptional() partido?: string;
  @IsString() @IsOptional() fotoUrl?: string;
  @IsInt() @IsOptional() @Min(1500) @Max(2200) mandatoInicio?: number;
  @IsInt() @IsOptional() @Min(1500) @Max(2200) mandatoFim?: number;
  @IsBoolean() @IsOptional() atual?: boolean;
  @IsString() @IsOptional() resumo?: string;
  @IsString() @IsOptional() historia?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() telefone?: string;
  @IsInt() @IsOptional() ordem?: number;
  @IsBoolean() @IsOptional() ativo?: boolean;
}

export class AtualizarPrefeitoDto {
  @IsString() @IsOptional() @IsNotEmpty() nome?: string;
  @IsString() @IsOptional() @IsIn(['prefeito', 'vice', 'primeira_dama']) tipo?: string;
  @IsString() @IsOptional() @IsIn(['masculino', 'feminino']) genero?: string;
  @IsString() @IsOptional() partido?: string;
  @IsString() @IsOptional() fotoUrl?: string;
  @IsInt() @IsOptional() @Min(1500) @Max(2200) mandatoInicio?: number;
  @IsInt() @IsOptional() @Min(1500) @Max(2200) mandatoFim?: number;
  @IsBoolean() @IsOptional() atual?: boolean;
  @IsString() @IsOptional() resumo?: string;
  @IsString() @IsOptional() historia?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() telefone?: string;
  @IsInt() @IsOptional() ordem?: number;
  @IsBoolean() @IsOptional() ativo?: boolean;
}
