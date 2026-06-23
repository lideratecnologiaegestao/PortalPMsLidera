import { IsString, MaxLength } from 'class-validator';

export class UpsertNotaDto {
  @IsString()
  @MaxLength(5000)
  conteudo!: string;
}
