import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class BrasaoItemDto {
  @IsString() url!: string;
  @IsString() @IsOptional() titulo?: string;
}

export class SalvarHinoBrasaoDto {
  @IsString() @IsOptional() hinoTexto?: string;
  @IsString() @IsOptional() @IsIn(['audio', 'video', 'youtube']) hinoMidiaTipo?: string;
  @IsString() @IsOptional() hinoMidiaUrl?: string;
  @IsString() @IsOptional() brasaoHistoria?: string;
  @IsArray() @IsOptional() brasoes?: { url: string; titulo?: string }[];
}
