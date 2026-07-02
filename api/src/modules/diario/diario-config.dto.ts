import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/** Ajustes de layout do PDF do Diário (todos opcionais — PATCH parcial). */
export class AtualizarDiarioConfigDto {
  @IsIn([1, 2]) @IsOptional() colunas?: number;
  @IsBoolean() @IsOptional() cabecalhoAtivo?: boolean;
  @IsBoolean() @IsOptional() rodapeAtivo?: boolean;
  @IsBoolean() @IsOptional() incluirHinos?: boolean;
  @IsString() @IsOptional() endereco?: string;
  @IsString() @IsOptional() horarioAtendimento?: string;
  @IsString() @IsOptional() telefone?: string;
}
