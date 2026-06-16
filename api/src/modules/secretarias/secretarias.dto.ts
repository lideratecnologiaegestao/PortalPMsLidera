import {
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
