import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * DTO de atualização parcial da config do App do Cidadão.
 *
 * Convenções:
 *  - Campo ausente (undefined) → mantém o valor atual.
 *  - Campos build-time (bundleId, easProjectId, easOwner, apiUrl) só
 *    podem ser alterados por super_admin; admin_prefeitura recebe 403
 *    se tentar enviá-los (validado no service, não no DTO).
 */
export class AtualizarAppConfigDto {
  // ------------------------------------------------------------------
  // Identidade do build (build-time)
  // ------------------------------------------------------------------
  @IsOptional() @IsString() @Length(0, 200) appName?: string;
  @IsOptional() @IsString() @Length(0, 100) appShortName?: string;
  @IsOptional() @IsString() @Length(0, 200) appVersion?: string;

  /** Só super_admin pode alterar. admin_prefeitura recebe 403. */
  @IsOptional() @IsString() @Length(0, 200) bundleId?: string;
  @IsOptional() @IsString() @Length(0, 100) scheme?: string;
  /** Só super_admin pode alterar. */
  @IsOptional() @IsString() @Length(0, 500) apiUrl?: string;
  /** Só super_admin pode alterar. */
  @IsOptional() @IsString() @Length(0, 200) easProjectId?: string;
  /** Só super_admin pode alterar. */
  @IsOptional() @IsString() @Length(0, 200) easOwner?: string;

  // ------------------------------------------------------------------
  // Tema (runtime)
  // ------------------------------------------------------------------
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'primaryColor deve ser uma cor hex válida (#RGB ou #RRGGBB).' })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'secondaryColor deve ser uma cor hex válida (#RGB ou #RRGGBB).' })
  secondaryColor?: string;

  @IsOptional()
  @ValidateIf((o) => typeof o.splashBgColor === 'string' && o.splashBgColor.length > 0)
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, { message: 'splashBgColor deve ser uma cor hex válida (#RGB ou #RRGGBB).' })
  splashBgColor?: string;

  // ------------------------------------------------------------------
  // Módulos (runtime)
  // ------------------------------------------------------------------
  @IsOptional() @IsBoolean() moduloDenuncia?: boolean;
  @IsOptional() @IsBoolean() moduloMapa?: boolean;
  @IsOptional() @IsBoolean() moduloOuvidoria?: boolean;
  @IsOptional() @IsBoolean() moduloEsic?: boolean;
  @IsOptional() @IsBoolean() moduloChat?: boolean;
  @IsOptional() @IsBoolean() moduloServicos?: boolean;
  @IsOptional() @IsBoolean() moduloNoticias?: boolean;
  @IsOptional() @IsBoolean() moduloCarteira?: boolean;
  @IsOptional() @IsBoolean() moduloGaleria?: boolean;
  @IsOptional() @IsBoolean() moduloDocumentos?: boolean;

  /** O painel envia os módulos ANINHADOS ({denuncia,mapa,...}); o service mapeia p/ as colunas. */
  @IsOptional() @IsObject() modulos?: Record<string, boolean>;

  // ------------------------------------------------------------------
  // Conteúdo institucional (runtime, JSONB)
  // ------------------------------------------------------------------
  @IsOptional() @IsArray() onboardingSlides?: unknown[];
  @IsOptional() @IsArray() acessoRapido?: unknown[];
  @IsOptional() @IsArray() categoriasChamados?: unknown[];

  // ------------------------------------------------------------------
  // Push / comportamento (runtime)
  // ------------------------------------------------------------------
  @IsOptional() @IsBoolean() pushHabilitado?: boolean;
  @IsOptional() @IsBoolean() biometriaHabilitada?: boolean;
  @IsOptional() @IsBoolean() onboardingAtivo?: boolean;
}

/** Campos exclusivos do super_admin que admin_prefeitura não pode tocar. */
export const CAMPOS_SUPER_ADMIN: ReadonlyArray<keyof AtualizarAppConfigDto> = [
  'bundleId',
  'apiUrl',
  'easProjectId',
  'easOwner',
] as const;
