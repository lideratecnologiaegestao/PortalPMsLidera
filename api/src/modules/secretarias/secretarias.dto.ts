import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CriarSecretariaDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsOptional()
  tipo?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  sigla?: string;

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsString()
  @IsOptional()
  fotoUrl?: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  sobre?: string;

  @IsString()
  @IsOptional()
  competencias?: string;

  @IsString()
  @IsOptional()
  secretarioBio?: string;

  @IsString()
  @IsOptional()
  secretarioCargo?: string;

  @IsString()
  @IsOptional()
  endereco?: string;

  @IsString()
  @IsOptional()
  cep?: string;

  @IsString()
  @IsOptional()
  horario?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}

/** Evento da agenda da secretaria (datas como string local; backend converte por fuso). */
export class DadosEventoDto {
  @IsString() @IsOptional() titulo?: string;
  @IsString() @IsOptional() descricao?: string;
  @IsString() @IsOptional() local?: string;
  @IsString() @IsOptional() imagemUrl?: string;
  @IsString() @IsOptional() inicio?: string; // "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm"
  @IsString() @IsOptional() fim?: string;
  @IsBoolean() @IsOptional() diaInteiro?: boolean;
  @IsString() @IsOptional() timezone?: string; // IANA, ex.: America/Cuiaba
  @IsBoolean() @IsOptional() ativo?: boolean;
  @IsInt() @IsOptional() ordem?: number;
  @IsArray() @IsOptional() @IsString({ each: true }) unidadeIds?: string[];
}

export class AtualizarSecretariaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nome?: string;

  @IsString()
  @IsOptional()
  tipo?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  sigla?: string;

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsString()
  @IsOptional()
  fotoUrl?: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  sobre?: string;

  @IsString()
  @IsOptional()
  competencias?: string;

  @IsString()
  @IsOptional()
  secretarioBio?: string;

  @IsString()
  @IsOptional()
  secretarioCargo?: string;

  @IsString()
  @IsOptional()
  endereco?: string;

  @IsString()
  @IsOptional()
  cep?: string;

  @IsString()
  @IsOptional()
  horario?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
