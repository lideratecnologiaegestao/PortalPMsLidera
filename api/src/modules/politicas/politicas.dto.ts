import { IsIn, IsOptional, IsString } from 'class-validator';

export class SalvarPoliticaDto {
  @IsString() @IsOptional() titulo?: string;
  @IsString() @IsOptional() conteudo?: string;
  @IsString() @IsOptional() @IsIn(['html', 'md']) formato?: string;
}
