import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** Edição de um hino estadual (base global compartilhada). */
export class AtualizarHinoEstadualDto {
  @IsString() @IsOptional() titulo?: string;
  @IsString() @IsOptional() autores?: string;
  @IsString() @IsOptional() letra?: string;
  @IsString() @IsOptional() fonte?: string;
  @IsBoolean() @IsOptional() oficial?: boolean;
}
