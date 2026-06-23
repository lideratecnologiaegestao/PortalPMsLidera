import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

/** DTO de criação de um conteúdo global de conhecimento da IA. */
export class CriarConteudoGlobalDto {
  @IsString()
  @IsNotEmpty()
  dominio!: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  leiReferencia?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  fonteUrl?: string;

  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  conteudo!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** DTO de atualização parcial de conteúdo global. */
export class AtualizarConteudoGlobalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dominio?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  leiReferencia?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  fonteUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  conteudo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Query params de listagem do acervo global. */
export class ListarConteudosGlobalQuery {
  @IsOptional()
  @IsString()
  dominio?: string;

  /** Termo de busca full-text. */
  @IsOptional()
  @IsString()
  q?: string;
}
