import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FormularioStatus } from './formularios.types';

const STATUS_VALIDOS: FormularioStatus[] = ['rascunho', 'publicado', 'encerrado'];

export class CriarFormularioDto {
  @IsString()
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  /** Schema como array de campos JSON. Validado no service. */
  @IsOptional()
  schema?: unknown;
}

export class AtualizarFormularioDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  schema?: unknown;

  @IsOptional()
  @IsIn(STATUS_VALIDOS)
  status?: FormularioStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mensagemConfirmacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirecionarUrl?: string;

  @IsOptional()
  @IsBoolean()
  loginObrigatorio?: boolean;

  @IsOptional()
  @IsBoolean()
  multiplosEnvios?: boolean;

  @IsOptional()
  @IsBoolean()
  captchaHabilitado?: boolean;

  @IsOptional()
  @IsArray()
  notificarEmails?: string[];

  @IsOptional()
  @IsArray()
  notificarCc?: string[];

  @IsOptional()
  @IsArray()
  notificarBcc?: string[];
}

export class PatchEnvioDto {
  @IsOptional()
  @IsBoolean()
  lido?: boolean;
}
