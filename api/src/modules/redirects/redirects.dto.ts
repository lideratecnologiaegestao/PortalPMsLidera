import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CriarRedirectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  origem!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  destino!: string;

  @IsOptional()
  @IsNumber()
  @IsIn([301, 302, 307, 308])
  statusCode?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class AtualizarRedirectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  origem?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  destino?: string;

  @IsOptional()
  @IsNumber()
  @IsIn([301, 302, 307, 308])
  statusCode?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class BulkItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  origem!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  destino!: string;

  @IsOptional()
  @IsNumber()
  @IsIn([301, 302, 307, 308])
  statusCode?: number;
}

export class BulkRedirectDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => BulkItemDto)
  itens!: BulkItemDto[];
}
