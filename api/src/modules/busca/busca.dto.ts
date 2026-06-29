import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** Tipos de conteúdo indexável (espelha o CHECK no schema SQL). */
export const TIPOS_BUSCA = [
  'noticia',
  'documento',
  'diario',
  'servico',
  'secretaria',
  'cms',
  'transparencia',
  'licitacao',
  'contrato',
  'convenio',
  'conselho',
  'concurso',
  'prefeito',
  'historia',
  'hino_brasao',
  'politica',
] as const;

export type TipoBusca = (typeof TIPOS_BUSCA)[number];

export class BuscaQueryDto {
  /** Termo de busca (2–200 chars). */
  @IsString()
  @Length(2, 200)
  q!: string;

  /** Filtra por tipo de conteúdo (opcional). */
  @IsOptional()
  @IsIn([...TIPOS_BUSCA])
  tipo?: TipoBusca;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/** Shape de um resultado individual. */
export interface ResultadoBusca {
  tipo: TipoBusca;
  refId: string;
  titulo: string;
  subtitulo: string | null;
  snippet: string | null;
  url: string;
  score: number;
  publicadoEm: Date | null;
}

/** Resposta paginada do endpoint GET /api/busca. */
export interface RespostaBusca {
  total: number;
  page: number;
  pageSize: number;
  resultados: ResultadoBusca[];
}
