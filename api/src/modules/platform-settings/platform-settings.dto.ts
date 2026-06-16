import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * DTO de gravação da config global da plataforma.
 * Convenção: campo ausente mantém; string vazia '' limpa (inclui a senha SMTP).
 */
export class SalvarPlatformGlobalDto {
  // Desenvolvido por
  @IsOptional() @IsBoolean() devAtivo?: boolean;
  @IsOptional() @IsString() @Length(0, 200) devNome?: string;
  @IsOptional() @IsString() @Length(0, 200) devRazaoSocial?: string;
  @IsOptional() @IsString() @Length(0, 40) devCnpj?: string;
  @IsOptional() @IsString() @Length(0, 300) devEndereco?: string;
  @IsOptional() @IsString() @Length(0, 200) devEmail?: string;
  @IsOptional() @IsString() @Length(0, 300) devSuporteUrl?: string;
  @IsOptional() @IsString() @Length(0, 40) devWhatsapp?: string;
  @IsOptional() @IsString() @Length(0, 300) devSiteUrl?: string;
  @IsOptional() @IsString() @Length(0, 500) devLogoUrl?: string;

  // SMTP global
  @IsOptional() @IsBoolean() smtpAtivo?: boolean;
  @IsOptional() @IsString() @Length(0, 200) smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() @Length(0, 200) smtpUser?: string;
  @IsOptional() @IsString() @Length(0, 300) smtpPass?: string;
  @IsOptional() @IsString() @Length(0, 200) smtpFrom?: string;

  // Backups (config livre; execução evolui depois)
  @IsOptional() @IsObject() backup?: Record<string, unknown>;

  // IA global (defaults; override por entidade tem prioridade)
  @IsOptional() @IsString() @Length(0, 80) iaModel?: string;
  @IsOptional() @IsIn(['voyage', 'openai', '']) embeddingsProvider?: string;
  @IsOptional() @IsString() @Length(0, 80) embeddingsModel?: string;
  @IsOptional() @IsString() @Length(0, 300) anthropicKey?: string;
  @IsOptional() @IsString() @Length(0, 300) voyageKey?: string;
  @IsOptional() @IsString() @Length(0, 300) openaiKey?: string;
}
