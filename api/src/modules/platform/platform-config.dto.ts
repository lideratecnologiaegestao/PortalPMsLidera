import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * DTOs do painel "Configurações da Entidade" do Gerenciador (super_admin).
 * Convenção de limpeza: para campos de segredo/texto opcionais, enviar string
 * vazia ('') LIMPA o override (volta ao global). Campos ausentes mantêm o atual.
 */

// ----------------------------------------------------------------- IA
export class PlatformIaConfigDto {
  /** Teto de chunks do corpus vetorial. null limpa (volta ao default global). */
  @IsOptional()
  @ValidateIf((o) => o.iaMaxChunks !== null && o.iaMaxChunks !== undefined)
  @IsInt()
  @Min(100)
  @Max(50_000)
  iaMaxChunks?: number | null;

  /** 'voyage' | 'openai' | '' (vazio limpa → usa o provedor global). */
  @IsOptional()
  @IsIn(['voyage', 'openai', ''])
  embeddingsProvider?: string;

  /** Chaves próprias da entidade (cifradas em repouso). '' limpa. */
  @IsOptional() @IsString() @Length(0, 300) voyageApiKey?: string;
  @IsOptional() @IsString() @Length(0, 300) anthropicApiKey?: string;
  @IsOptional() @IsString() @Length(0, 300) openaiApiKey?: string;

  @IsOptional() @IsBoolean() ativo?: boolean;
}

// ----------------------------------------------------------------- WhatsApp
export class PlatformWhatsappConfigDto {
  @IsOptional() @IsIn(['zapi', 'evolution', 'meta']) provider?: string;
  @IsOptional() @IsIn(['zapi', 'evolution', 'meta']) fallbackProvider?: string;
  @IsOptional() @IsString() @Length(0, 200) zapiInstanceId?: string;
  @IsOptional() @IsString() @Length(0, 400) zapiToken?: string;
  @IsOptional() @IsString() @Length(0, 400) zapiClientToken?: string;
  @IsOptional() @IsString() @Length(0, 300) evolutionApiUrl?: string;
  @IsOptional() @IsString() @Length(0, 200) evolutionInstance?: string;
  @IsOptional() @IsString() @Length(0, 400) evolutionApiKey?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

// ----------------------------------------------------------------- Atendimento
export class PlatformAtendimentoConfigDto {
  @IsOptional() @IsBoolean() atendimentoHumanoAtivo?: boolean;
  @IsOptional() @IsBoolean() iaChatWidgetAtivo?: boolean;
  @IsOptional() @IsBoolean() iaChatHabilitada?: boolean;
  @IsOptional() @IsBoolean() iaTriagemHabilitada?: boolean;
  @IsOptional() @IsString() @Length(0, 500) atendimentoSaudacao?: string;
  @IsOptional() @IsString() @Length(0, 500) atendimentoAvisoLgpd?: string;
  @IsOptional() @IsString() @Length(0, 500) atendimentoMensagemForaExp?: string;
  @IsOptional() @IsInt() @Min(1) @Max(240) atendimentoInatividadeMin?: number;
  @IsOptional() @IsString() @Length(0, 60) atendimentoTimezone?: string;
}

// ----------------------------------------------------------------- APLIC (Transparência)
export class PlatformAplicConfigDto {
  /** Liga/desliga a fonte APLIC (TCE-MT) na Transparência desta entidade. */
  @IsOptional() @IsBoolean() aplicHabilitado?: boolean;

  /**
   * Código da Unidade Gestora no TCE-MT: exatamente 7 dígitos. Obrigatório
   * para habilitar (validado no controller). '' limpa a UG.
   */
  @IsOptional()
  @ValidateIf((o) => typeof o.aplicUg === 'string' && o.aplicUg.length > 0)
  @Matches(/^\d{7}$/, { message: 'A UG deve ter exatamente 7 dígitos.' })
  aplicUg?: string;
}

// ----------------------------------------------------------------- LGPD / DPO
export class PlatformLgpdConfigDto {
  @IsOptional() @IsString() @Length(0, 200) dpoNome?: string;
  /** '' limpa; senão precisa ser e-mail. */
  @IsOptional()
  @ValidateIf((o) => typeof o.dpoEmail === 'string' && o.dpoEmail.length > 0)
  @IsEmail({}, { message: 'E-mail do DPO inválido.' })
  dpoEmail?: string;
}
