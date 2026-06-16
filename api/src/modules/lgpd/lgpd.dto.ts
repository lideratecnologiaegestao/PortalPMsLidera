/**
 * DTOs de entrada para o módulo LGPD.
 * Validados com class-validator — nunca confia no body para identidade.
 */
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsEmail,
  IsArray,
  IsInt,
  Min,
  IsDateString,
  IsBoolean,
} from 'class-validator';

// ─── Solicitações do Titular ─────────────────────────────────────────────────

export enum SolicitacaoTipo {
  CONFIRMACAO_EXISTENCIA = 'confirmacao_existencia',
  ACESSO = 'acesso',
  CORRECAO = 'correcao',
  ANONIMIZACAO = 'anonimizacao',
  BLOQUEIO = 'bloqueio',
  ELIMINACAO = 'eliminacao',
  PORTABILIDADE = 'portabilidade',
  INFO_COMPARTILHAMENTO = 'info_compartilhamento',
  REVOGACAO_CONSENTIMENTO = 'revogacao_consentimento',
  OPOSICAO = 'oposicao',
  REVISAO_DECISAO_AUTOMATIZADA = 'revisao_decisao_automatizada',
}

export enum SolicitacaoStatus {
  ABERTA = 'aberta',
  EM_ANDAMENTO = 'em_andamento',
  ENCAMINHADA = 'encaminhada',
  CONCLUIDA = 'concluida',
  INDEFERIDA = 'indeferida',
}

export class CriarSolicitacaoDto {
  @IsEnum(SolicitacaoTipo, {
    message: `tipo deve ser um dos valores: ${Object.values(SolicitacaoTipo).join(', ')}`,
  })
  tipo!: SolicitacaoTipo;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;
}

export class AtualizarSolicitacaoDto {
  @IsOptional()
  @IsEnum(SolicitacaoStatus, {
    message: `status deve ser um dos valores: ${Object.values(SolicitacaoStatus).join(', ')}`,
  })
  status?: SolicitacaoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  resposta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  indeferimentoMotivo?: string;
}

// ─── Encarregado (DPO) ───────────────────────────────────────────────────────

export class AtualizarEncarregadoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dpoNome?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  dpoEmail?: string;
}

// ─── Incidentes de Segurança ─────────────────────────────────────────────────

export enum IncidenteCategoria {
  ACESSO_INDEVIDO = 'acesso_indevido',
  VAZAMENTO = 'vazamento',
  PERDA = 'perda',
  RANSOMWARE = 'ransomware',
  INDISPONIBILIDADE = 'indisponibilidade',
  ERRO_HUMANO = 'erro_humano',
  OUTRO = 'outro',
}

export enum IncidenteSeveridade {
  BAIXA = 'baixa',
  MEDIA = 'media',
  ALTA = 'alta',
  CRITICA = 'critica',
}

export enum IncidenteStatus {
  REGISTRADO = 'registrado',
  EM_AVALIACAO = 'em_avaliacao',
  EM_CONTENCAO = 'em_contencao',
  COMUNICADO = 'comunicado',
  ENCERRADO = 'encerrado',
}

export class CriarIncidenteDto {
  @IsString()
  @MaxLength(500)
  titulo!: string;

  @IsString()
  @MaxLength(10000)
  descricao!: string;

  @IsEnum(IncidenteCategoria, {
    message: `categoria deve ser um dos valores: ${Object.values(IncidenteCategoria).join(', ')}`,
  })
  categoria!: IncidenteCategoria;

  @IsEnum(IncidenteSeveridade, {
    message: `severidade deve ser um dos valores: ${Object.values(IncidenteSeveridade).join(', ')}`,
  })
  severidade!: IncidenteSeveridade;

  @IsArray()
  @IsString({ each: true })
  dadosAfetados!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  titularesAfetadosEstimados?: number;

  @IsOptional()
  @IsDateString()
  ocorridoEm?: string;

  @IsOptional()
  @IsDateString()
  detectadoEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  natureza?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  riscoDescricao?: string;
}

export class AtualizarIncidenteDto {
  @IsOptional()
  @IsEnum(IncidenteStatus, {
    message: `status deve ser um dos valores: ${Object.values(IncidenteStatus).join(', ')}`,
  })
  status?: IncidenteStatus;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  medidasContencao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  medidasMitigacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  riscoDescricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  riscoNivel?: string;

  @IsOptional()
  @IsBoolean()
  comunicadoAnpd?: boolean;

  @IsOptional()
  @IsDateString()
  comunicadoAnpdEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  comunicadoAnpdProtocolo?: string;

  @IsOptional()
  @IsBoolean()
  comunicadoTitulares?: boolean;

  @IsOptional()
  @IsDateString()
  comunicadoTitularesEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  comunicadoTitularesMeio?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  titularesAfetadosEstimados?: number;
}
