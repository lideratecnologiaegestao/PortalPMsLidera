import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

// ─────────────────────────────────────────────────────────── Curso
export class CriarCursoDto {
  @IsString() @IsNotEmpty() titulo!: string;
  @IsString() @IsOptional() slug?: string;
  @IsString() @IsOptional() resumo?: string;
  @IsString() @IsOptional() descricao?: string;
  @IsString() @IsOptional() conteudoProgramatico?: string;
  @IsString() @IsOptional() capaUrl?: string;
  @IsString() @IsOptional() capaStorageKey?: string;
  @IsInt() @IsOptional() cargaHoraria?: number;
  @IsString() @IsOptional() inicioEm?: string; // YYYY-MM-DD
  @IsString() @IsOptional() fimEm?: string;
  @IsBoolean() @IsOptional() certificacao?: boolean;
  @IsNumber() @IsOptional() notaMinima?: number;
  @IsString() @IsOptional() templateId?: string;
  @IsString() @IsOptional() status?: string; // rascunho|publicado|encerrado
  @IsBoolean() @IsOptional() publicado?: boolean;
  @IsInt() @IsOptional() ordem?: number;
}

export class AtualizarCursoDto extends PartialType(CriarCursoDto) {}

// ─────────────────────────────────────────────────────────── Módulo
export class CriarModuloDto {
  @IsString() @IsNotEmpty() titulo!: string;
  @IsString() @IsOptional() descricao?: string;
  @IsInt() @IsOptional() ordem?: number;
}
export class AtualizarModuloDto extends PartialType(CriarModuloDto) {}

// ─────────────────────────────────────────────────────────── Aula
export class CriarAulaDto {
  @IsString() @IsNotEmpty() moduloId!: string;
  @IsString() @IsNotEmpty() titulo!: string;
  @IsObject() @IsOptional() conteudo?: Record<string, unknown>; // EditorJS
  @IsString() @IsOptional() videoUrl?: string;
  @IsString() @IsOptional() storageKey?: string;
  @IsInt() @IsOptional() duracaoMin?: number;
  @IsInt() @IsOptional() ordem?: number;
}
export class AtualizarAulaDto {
  @IsString() @IsOptional() titulo?: string;
  @IsObject() @IsOptional() conteudo?: Record<string, unknown>;
  @IsString() @IsOptional() videoUrl?: string;
  @IsString() @IsOptional() storageKey?: string;
  @IsInt() @IsOptional() duracaoMin?: number;
  @IsInt() @IsOptional() ordem?: number;
}

// ─────────────────────────────────────────────────────────── Prova
export class OpcaoDto {
  @IsString() @IsNotEmpty() texto!: string;
  @IsBoolean() @IsOptional() correta?: boolean;
  @IsInt() @IsOptional() ordem?: number;
}
export class QuestaoDto {
  @IsString() @IsNotEmpty() enunciado!: string;
  @IsString() @IsOptional() tipo?: string; // objetiva|dissertativa
  @IsNumber() @IsOptional() peso?: number;
  @IsInt() @IsOptional() ordem?: number;
  @IsArray() @IsOptional() opcoes?: OpcaoDto[];
}
export class CriarProvaDto {
  @IsString() @IsNotEmpty() titulo!: string;
  @IsString() @IsOptional() moduloId?: string; // null = prova final
  @IsString() @IsOptional() descricao?: string;
  @IsNumber() @IsOptional() notaMinima?: number;
  @IsInt() @IsOptional() tempoLimiteMin?: number;
  @IsInt() @IsOptional() maxTentativas?: number;
  @IsBoolean() @IsOptional() embaralhar?: boolean;
  @IsBoolean() @IsOptional() ativa?: boolean;
  @IsInt() @IsOptional() ordem?: number;
  @IsArray() @IsOptional() questoes?: QuestaoDto[];
}
export class AtualizarProvaDto extends PartialType(CriarProvaDto) {}

// ─────────────────────────────────────────────── Tentativa de prova (aluno)
export class RespostaQuestaoDto {
  @IsString() @IsNotEmpty() questaoId!: string;
  @IsString() @IsOptional() opcaoId?: string;        // objetiva
  @IsString() @IsOptional() respostaTexto?: string;  // dissertativa
}
export class SubmeterProvaDto {
  @IsString() @IsNotEmpty() tentativaId!: string;
  @IsArray() respostas!: RespostaQuestaoDto[];
}

// ───────────────────────────────────── Correção dissertativa (professor)
export class CorrecaoQuestaoDto {
  @IsString() @IsNotEmpty() tentativaQuestaoId!: string;
  @IsNumber() nota!: number;
  @IsString() @IsOptional() feedback?: string;
}
export class CorrigirTentativaDto {
  @IsArray() correcoes!: CorrecaoQuestaoDto[];
}

// ─────────────────────────────────────────────────────────── Fórum
export class DuvidaDto {
  @IsString() @IsNotEmpty() aulaId!: string;
  @IsString() @IsOptional() titulo?: string;
  @IsString() @IsNotEmpty() mensagem!: string;
}
export class RespostaDuvidaDto {
  @IsString() @IsNotEmpty() mensagem!: string;
}

// ─────────────────────────────────────────────────────────── Feedback
export class FeedbackDto {
  @IsInt() @Min(1) @Max(5) nota!: number;
  @IsString() @IsOptional() comentario?: string;
}

// ─────────────────────────────────── Templates de certificado (admin)
export class TextoTemplateDto {
  @IsString() @IsNotEmpty() conteudo!: string;
  @IsNumber() @IsOptional() posX?: number;
  @IsNumber() @IsOptional() posY?: number;
  @IsNumber() @IsOptional() largura?: number;
  @IsString() @IsOptional() fonte?: string;
  @IsInt() @IsOptional() tamanho?: number;
  @IsString() @IsOptional() cor?: string;
  @IsString() @IsOptional() alinhamento?: string;
  @IsBoolean() @IsOptional() negrito?: boolean;
  @IsInt() @IsOptional() ordem?: number;
}
export class ElementoTemplateDto {
  @IsString() @IsOptional() tipo?: string; // qr|linha|retangulo|assinatura
  @IsNumber() @IsOptional() posX?: number;
  @IsNumber() @IsOptional() posY?: number;
  @IsNumber() @IsOptional() largura?: number;
  @IsNumber() @IsOptional() altura?: number;
  @IsObject() @IsOptional() config?: Record<string, unknown>;
  @IsInt() @IsOptional() ordem?: number;
}
export class FotoTemplateDto {
  @IsString() @IsOptional() url?: string;
  @IsString() @IsOptional() storageKey?: string;
  @IsNumber() @IsOptional() posX?: number;
  @IsNumber() @IsOptional() posY?: number;
  @IsNumber() @IsOptional() largura?: number;
  @IsNumber() @IsOptional() altura?: number;
  @IsInt() @IsOptional() ordem?: number;
}
/** Uma página do certificado: fundo próprio + itens. Dimensão é global do template. */
export class PaginaTemplateDto {
  @IsString() @IsOptional() fundoUrl?: string;
  @IsString() @IsOptional() fundoStorageKey?: string;
  @IsInt() @IsOptional() ordem?: number;
  @IsArray() @IsOptional() textos?: TextoTemplateDto[];
  @IsArray() @IsOptional() elementos?: ElementoTemplateDto[];
  @IsArray() @IsOptional() fotos?: FotoTemplateDto[];
}
export class CriarTemplateDto {
  @IsString() @IsNotEmpty() nome!: string;
  @IsString() @IsOptional() typeId?: string;
  @IsString() @IsOptional() fundoUrl?: string;
  @IsString() @IsOptional() fundoStorageKey?: string;
  @IsInt() @IsOptional() largura?: number;
  @IsInt() @IsOptional() altura?: number;
  @IsString() @IsOptional() orientacao?: string; // paisagem|retrato
  @IsBoolean() @IsOptional() padrao?: boolean;
  @IsBoolean() @IsOptional() ativo?: boolean;
  // Multipágina: `paginas` tem precedência. Se ausente, os arrays flat abaixo
  // são tratados como uma única página (compatibilidade).
  @IsArray() @IsOptional() paginas?: PaginaTemplateDto[];
  @IsArray() @IsOptional() textos?: TextoTemplateDto[];
  @IsArray() @IsOptional() elementos?: ElementoTemplateDto[];
  @IsArray() @IsOptional() fotos?: FotoTemplateDto[];
}
export class AtualizarTemplateDto extends PartialType(CriarTemplateDto) {}
export class TipoCertificadoDto {
  @IsString() @IsNotEmpty() nome!: string;
  @IsString() @IsOptional() descricao?: string;
  @IsBoolean() @IsOptional() ativo?: boolean;
  @IsInt() @IsOptional() ordem?: number;
}
