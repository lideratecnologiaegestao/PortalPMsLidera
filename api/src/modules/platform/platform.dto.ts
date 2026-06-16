import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * DTO de login do super_admin na plataforma.
 * Validação básica — a verificação de credenciais é no service.
 */
export class PlatformLoginDto {
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @IsString()
  @Length(1, 200)
  senha!: string;
}

const PLANOS_VALIDOS = ['padrao', 'capital', 'dedicado'] as const;
export type Plano = (typeof PLANOS_VALIDOS)[number];

/**
 * DTO de criação de tenant. Exige ao menos dominio OU subdominio
 * para o tenant ser acessível.
 */
export class CriarTenantDto {
  @IsString()
  @Length(1, 200)
  nome!: string;

  /** Identificador único lowercase com hífens, ex.: "cuiaba-mt" */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug deve ser minúsculo, sem espaços (hífens permitidos).',
  })
  @Length(2, 80)
  slug!: string;

  @IsString()
  @Length(2, 2)
  uf!: string;

  @IsString()
  @IsOptional()
  municipioIbge?: string;

  /** CNPJ somente dígitos ou formatado. Validação apenas de presença. */
  @IsString()
  @IsOptional()
  cnpj?: string;

  @IsString()
  @IsOptional()
  dominio?: string;

  @IsString()
  @IsOptional()
  subdominio?: string;

  @IsIn(PLANOS_VALIDOS, { message: 'plano deve ser padrao, capital ou dedicado.' })
  @IsOptional()
  plano?: Plano;

  /** Nome do admin inicial do tenant. Padrão: 'Administrador'. */
  @IsString()
  @IsOptional()
  adminNome?: string;

  /** E-mail do admin inicial. Se omitido, usa admin@<dominio|subdominio>. */
  @IsEmail({}, { message: 'adminEmail inválido.' })
  @IsOptional()
  adminEmail?: string;
}

/**
 * DTO de atualização parcial de tenant.
 */
export class AtualizarTenantDto {
  @IsString()
  @Length(1, 200)
  @IsOptional()
  nome?: string;

  @IsString()
  @Length(2, 2)
  @IsOptional()
  uf?: string;

  @IsString()
  @IsOptional()
  dominio?: string;

  @IsString()
  @IsOptional()
  subdominio?: string;

  @IsIn(PLANOS_VALIDOS, { message: 'plano deve ser padrao, capital ou dedicado.' })
  @IsOptional()
  plano?: Plano;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;

  @IsBoolean()
  @IsOptional()
  iaTriagemHabilitada?: boolean;

  @IsBoolean()
  @IsOptional()
  iaChatHabilitada?: boolean;
}
