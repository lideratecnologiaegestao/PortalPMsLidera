import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** DTO de criação de um item da base de conhecimento curada. */
export class CriarConhecimentoDto {
  @IsString()
  @IsNotEmpty()
  pergunta!: string;

  @IsString()
  @IsNotEmpty()
  resposta!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  fixado?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** DTO de atualização parcial de item da base de conhecimento. */
export class AtualizarConhecimentoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pergunta?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resposta?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  fixado?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
