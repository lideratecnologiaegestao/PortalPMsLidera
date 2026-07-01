import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/** Tipos aceitos (municipais) — espelham o CHECK `agenda_tipo_check` da migração 104. */
export const TIPOS_AGENDA_VALIDOS = [
  'evento', 'reuniao', 'audiencia_publica', 'feriado', 'ponto_facultativo',
  'data_comemorativa', 'programacao', 'prazo', 'outro',
] as const;

export class CriarAgendaItemDto {
  @IsString() @IsNotEmpty() titulo!: string;
  @IsIn(TIPOS_AGENDA_VALIDOS as unknown as string[]) @IsOptional() tipo?: string;
  @IsString() @IsOptional() descricao?: string;
  @IsString() @IsOptional() local?: string;
  @IsString() @IsOptional() link?: string;
  @IsString() @IsNotEmpty() inicio!: string; // ISO
  @IsString() @IsOptional() fim?: string; // ISO
  @IsBoolean() @IsOptional() diaInteiro?: boolean;
  @IsString() @IsOptional() timezone?: string;
  @IsString() @IsOptional() cor?: string;
  @IsIn(['nenhuma', 'anual']) @IsOptional() recorrencia?: string;
  @IsBoolean() @IsOptional() destaque?: boolean;
  @IsBoolean() @IsOptional() publico?: boolean;
  @IsBoolean() @IsOptional() ativo?: boolean;
  @IsInt() @IsOptional() ordem?: number;
}

export class AtualizarAgendaItemDto extends PartialType(CriarAgendaItemDto) {}
