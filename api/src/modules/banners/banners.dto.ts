import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CriarBannerDto {
  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  subtitulo?: string;

  @IsString()
  @IsOptional()
  imagemUrl?: string;

  @IsString()
  @IsOptional()
  linkUrl?: string;

  @IsString()
  @IsOptional()
  ctaLabel?: string;

  @IsString()
  @IsOptional()
  conteudoHtml?: string;

  @IsString()
  @IsOptional()
  inicioEm?: string;

  @IsString()
  @IsOptional()
  fimEm?: string;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}

export class AtualizarBannerDto {
  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  subtitulo?: string;

  @IsString()
  @IsOptional()
  imagemUrl?: string;

  @IsString()
  @IsOptional()
  linkUrl?: string;

  @IsString()
  @IsOptional()
  ctaLabel?: string;

  @IsString()
  @IsOptional()
  conteudoHtml?: string;

  @IsString()
  @IsOptional()
  inicioEm?: string;

  @IsString()
  @IsOptional()
  fimEm?: string;

  @IsInt()
  @IsOptional()
  ordem?: number;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
