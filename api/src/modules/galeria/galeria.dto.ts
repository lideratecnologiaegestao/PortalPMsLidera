import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CriarGaleriaDto {
  @IsString()
  @IsIn(['foto', 'video', 'audio'])
  tipo!: 'foto' | 'video' | 'audio';

  @IsString()
  @IsOptional()
  titulo?: string;

  /** Caminho da mídia (foto ou .mp4) vindo da Biblioteca de Mídia. */
  @IsString()
  @IsOptional()
  url?: string;

  /** URL ou ID de vídeo do YouTube (para tipo=video). */
  @IsString()
  @IsOptional()
  youtube?: string;

  @IsString()
  @IsOptional()
  secretariaId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  ordem?: number;
}

export class AtualizarGaleriaDto {
  @IsString()
  @IsIn(['foto', 'video', 'audio'])
  @IsOptional()
  tipo?: 'foto' | 'video' | 'audio';

  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  youtube?: string;

  @IsString()
  @IsOptional()
  secretariaId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  ordem?: number;
}
