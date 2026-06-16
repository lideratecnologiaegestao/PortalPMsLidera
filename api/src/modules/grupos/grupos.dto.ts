import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CriarGrupoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsArray()
  @IsString({ each: true })
  permissoes!: string[];

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}

export class AtualizarGrupoDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nome?: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissoes?: string[];

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}

export class AdicionarMembroDto {
  @IsUUID()
  userId!: string;
}
