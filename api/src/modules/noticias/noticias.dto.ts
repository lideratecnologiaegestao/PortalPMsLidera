import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CriarNoticiaDto {
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsOptional()
  resumo?: string;

  @IsString()
  @IsOptional()
  conteudo?: string;

  @IsString()
  @IsOptional()
  imagemUrl?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  autor?: string;

  @IsString()
  @IsOptional()
  fonte?: string;

  @IsString()
  @IsOptional()
  legenda?: string;

  @IsString()
  @IsOptional()
  credito?: string;

  @IsString()
  @IsOptional()
  encerraEm?: string;

  @IsString()
  @IsOptional()
  secretariaId?: string;

  @IsBoolean()
  @IsOptional()
  publicado?: boolean;
}

export class AtualizarNoticiaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  resumo?: string;

  @IsString()
  @IsOptional()
  conteudo?: string;

  @IsString()
  @IsOptional()
  imagemUrl?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  autor?: string;

  @IsString()
  @IsOptional()
  fonte?: string;

  @IsString()
  @IsOptional()
  legenda?: string;

  @IsString()
  @IsOptional()
  credito?: string;

  @IsString()
  @IsOptional()
  encerraEm?: string;

  @IsString()
  @IsOptional()
  secretariaId?: string;

  @IsBoolean()
  @IsOptional()
  publicado?: boolean;
}

export class ListarNoticiasQuery {
  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  pageSize?: string;
}

export class ListarNoticiasAdminQuery {
  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  publicado?: string; // 'true'|'false'

  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  pageSize?: string;
}
