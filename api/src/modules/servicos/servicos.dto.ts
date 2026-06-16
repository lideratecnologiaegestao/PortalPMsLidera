import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Eixos padronizados de público-alvo da Carta de Serviços (bloco 11 TR).
 * Valores em minúsculas para facilitar comparação e uso em query params.
 */
export const PUBLICOS_ALVO = [
  { valor: 'cidadao', label: 'Cidadão' },
  { valor: 'empresa', label: 'Empresa' },
  { valor: 'servidor', label: 'Servidor' },
] as const;

export type PublicoAlvoValor = (typeof PUBLICOS_ALVO)[number]['valor'];

/** Converte string vazia em undefined (campos opcionais de formulário). */
const vazioParaUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class EtapaDto {
  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsOptional()
  descricao?: string;
}

export class CriarServicoDto {
  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  orgaoResponsavel?: string;

  @IsString()
  @IsOptional()
  publicoAlvo?: string;

  @IsString()
  @IsOptional()
  requisitos?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EtapaDto)
  etapas?: EtapaDto[];

  @IsString()
  @IsOptional()
  canaisAtendimento?: string;

  @IsString()
  @IsOptional()
  prazoAtendimento?: string;

  @IsString()
  @IsOptional()
  custo?: string;

  @Transform(vazioParaUndefined)
  @IsUrl()
  @IsOptional()
  urlExterna?: string;

  @IsBoolean()
  @IsOptional()
  publicado?: boolean;

  @IsBoolean()
  @IsOptional()
  destaque?: boolean;

  @IsInt()
  @IsOptional()
  ordem?: number;
}

export class AtualizarServicoDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  orgaoResponsavel?: string;

  @IsString()
  @IsOptional()
  publicoAlvo?: string;

  @IsString()
  @IsOptional()
  requisitos?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EtapaDto)
  etapas?: EtapaDto[];

  @IsString()
  @IsOptional()
  canaisAtendimento?: string;

  @IsString()
  @IsOptional()
  prazoAtendimento?: string;

  @IsString()
  @IsOptional()
  custo?: string;

  @Transform(vazioParaUndefined)
  @IsUrl()
  @IsOptional()
  urlExterna?: string;

  @IsBoolean()
  @IsOptional()
  publicado?: boolean;

  @IsBoolean()
  @IsOptional()
  destaque?: boolean;

  @IsInt()
  @IsOptional()
  ordem?: number;
}

export class ListarServicosAdminQuery {
  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  publicado?: string; // 'true'|'false' — string da query

  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  pageSize?: string;

  /** Filtro por eixo de público-alvo: 'cidadao' | 'empresa' | 'servidor'. */
  @IsString()
  @IsOptional()
  publicoAlvo?: string;
}
