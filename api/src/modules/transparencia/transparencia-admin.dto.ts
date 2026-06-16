import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Converte string vazia em undefined (campos opcionais de formulário). */
const vazioParaUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/**
 * Aceita URL absoluta http(s) OU caminho enraizado servido pelo próprio portal
 * (ex.: `/midia/documento/...` da Biblioteca de Mídia, ou
 * `/api/transparencia/modelo/...`). Bloqueia `//host` (protocol-relative).
 */
const URL_OU_CAMINHO = /^(https?:\/\/\S+|\/(?!\/)\S*)$/;
const MSG_URL = 'urlExterna deve ser uma URL http(s) ou um caminho do portal (/...).';

export class CriarDocumentoDto {
  @IsString()
  @IsNotEmpty()
  categoria!: string;

  @IsInt()
  @IsOptional()
  exercicio?: number;

  @IsString()
  @IsOptional()
  periodo?: string;

  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @Transform(vazioParaUndefined)
  @Matches(URL_OU_CAMINHO, { message: MSG_URL })
  @IsOptional()
  urlExterna?: string;

  @IsString()
  @IsOptional()
  storageKey?: string;
}

export class AtualizarDocumentoDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  categoria?: string;

  @IsInt()
  @IsOptional()
  exercicio?: number;

  @IsString()
  @IsOptional()
  periodo?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;

  @Transform(vazioParaUndefined)
  @Matches(URL_OU_CAMINHO, { message: MSG_URL })
  @IsOptional()
  urlExterna?: string;

  @IsString()
  @IsOptional()
  storageKey?: string;
}
