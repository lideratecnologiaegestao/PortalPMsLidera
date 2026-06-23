/**
 * ComentarioModeradorService
 *
 * Moderação automática de comentários de cidadãos em 2 camadas:
 *
 *   Camada 1 — Determinística (sempre, sem IA): regex de código malicioso/injeção,
 *   lista de baixo calão pt-BR, heurística de spam. Rápida e sem custo de API.
 *
 *   Camada 2 — IA (apenas se iaChatHabilitada no tenant): Claude com prompt de
 *   moderação e resposta em JSON estrito. Timeout de 8 s + try/catch — falha
 *   graciosa para 'pendente' (humano decide).
 *
 * Política: NUNCA auto-aprova. Só reprova automaticamente quando há evidência
 * clara (Camada 1 ou IA). O que passar vira 'pendente' para moderação humana.
 *
 * LGPD: o `motivo` detalhado nunca é exposto ao cidadão (anti-probing).
 * Auditoria: `COMENTARIO_AUTO_REPROVADO` gravado pelo ComentariosService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicService } from '../ia/anthropic.service';
import { TenantContext } from '../../common/tenant/tenant.context';

// ============================================================================
// CAMADA 1 — constantes determinísticas
// ============================================================================

/**
 * Padrões de código malicioso / injeção.
 * Cada entrada é um RegExp case-insensitive testado contra o conteúdo bruto.
 */
const REGEX_CODIGO_MALICIOSO: RegExp[] = [
  // XSS — tags de script e execução inline
  /<script[\s>]/i,
  /<\/script>/i,
  /<iframe[\s>]/i,
  /javascript\s*:/i,
  /on\w{2,20}\s*=/i,         // onerror=, onload=, onclick=, etc.
  /<svg[\s>]/i,
  /eval\s*\(/i,
  /document\s*\.\s*cookie/i,
  // data: URI com HTML/JS (base64 ou texto)
  /data:\s*text\/html/i,
  /data:\s*application\/javascript/i,
  // SQL injection clássico
  /union\s+select/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /;\s*--/,
  /'\s*or\s*'?1'?\s*=\s*'?1/i,
  /select\s+.*\s+from\s+/i,
  // Template injection / SSTI
  /\{\{.*\}\}/,
  /\$\{.*\}/,
];

/**
 * Lista de baixo calão / palavrões em português brasileiro.
 * Usa limites de palavra (\b) onde possível para evitar falsos positivos
 * em substrings inocentes (ex: "assassino" não deve casar "ass").
 *
 * MANUTENÇÃO: adicione variações com acento e sem acento; evite termos
 * com mais de 2 letras de ambiguidade. Comentários em linha explicam escolhas.
 */
const PALAVROES_PTBR: RegExp[] = [
  // Termos de chacota/ofensa direta — forma básica + variações sem acento
  /\bputa\b/i,
  /\bputo\b/i,
  /\bviado\b/i,
  /\bbixo\b/i,             // xingamento, diferente do animal
  /\bvadio\b/i,
  /\bvagabund[ao]\b/i,
  /\bmerda\b/i,
  /\bmer[dh]+a\b/i,
  /\bporra\b/i,
  /\bcorno\b/i,
  /\bcorna\b/i,
  /\bfilh[ao]\s*d[ae]\s*put[ao]\b/i,
  /\bfdp\b/i,
  /\bbosta\b/i,
  /\bcuzao\b/i,
  /\bcuz[ãa]o\b/i,
  /\bcuzinho\b/i,
  /\bcu\b/i,
  /\bpau\s+no\s+cu\b/i,
  /\bdebil\s+mental\b/i,
  /\bimbecil\b/i,
  /\bidiota\b/i,
  /\bcretino\b/i,
  /\bbabaca\b/i,
  /\bsaf[ao]d[ao]\b/i,
  /\bpig[ao]\b/i,
  /\bbroxa\b/i,
  // Racismo / xenofobia — limiar alto, só formas inequívocas
  /\bnego\s+safad[ao]\b/i,
  // Palavrões sexuais inequívocos
  /\bfoder\b/i,
  /\bfoda[-\s]?se\b/i,
  /\bpinto\s+(grande|seu|teu)\b/i,
  /\bpau\s+(seu|teu|enorme)\b/i,
  /\bchupa\s+(meu|o)\b/i,
];

/** Testa se o conteúdo contém baixo calão. */
function temBaixoCalao(texto: string): boolean {
  return PALAVROES_PTBR.some((re) => re.test(texto));
}

/** Testa se o conteúdo parece código malicioso / injeção. */
function temCodigoMalicioso(texto: string): boolean {
  return REGEX_CODIGO_MALICIOSO.some((re) => re.test(texto));
}

/**
 * Heurísticas de spam:
 *   - Mais de 3 URLs (http/https ou www.)
 *   - Mesma palavra/sequência de 4+ chars repetida 5+ vezes
 *   - Mais de 60% de CAIXA ALTA num texto longo (>40 chars)
 *   - Sequência de 8+ caracteres idênticos (aaaaaaaaaa)
 */
function temSpam(texto: string): boolean {
  // Mais de 3 URLs
  const urls = (texto.match(/https?:\/\/|www\./gi) ?? []).length;
  if (urls > 3) return true;

  // Sequência de 8+ caracteres idênticos
  if (/(.)\1{7,}/.test(texto)) return true;

  // >60% CAIXA ALTA em textos longos
  if (texto.length > 40) {
    const letras = texto.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letras.length > 20) {
      const maiusculas = (letras.match(/[A-ZÀÁÂÃÄÉÊÍÓÔÕÚÜÇ]/g) ?? []).length;
      if (maiusculas / letras.length > 0.6) return true;
    }
  }

  // Mesma palavra (4+ chars) repetida 5+ vezes
  const palavras = texto.toLowerCase().match(/\b[\w]{4,}\b/g) ?? [];
  if (palavras.length >= 5) {
    const freq = new Map<string, number>();
    for (const p of palavras) {
      freq.set(p, (freq.get(p) ?? 0) + 1);
    }
    for (const n of freq.values()) {
      if (n >= 5) return true;
    }
  }

  return false;
}

// ============================================================================
// Resultado da avaliação
// ============================================================================

export interface ResultadoModeracao {
  decisao: 'reprovar' | 'pendente';
  categoria: string;
  motivo: string | null;
}

// ============================================================================
// Prompt de moderação (Camada 2 — IA)
// ============================================================================

const SISTEMA_MODERACAO = `\
Você é um moderador de comentários de um portal de PREFEITURA brasileira.
Analise o comentário enviado e decida se ele deve ser reprovado ou aceito para revisão humana.

REPROVE APENAS quando o comentário contiver:
  - Ofensa, ódio, assédio, incitação à violência ou discriminação
  - Palavrão / baixo calão explícito
  - Texto ininteligível / sem nexo / apenas caracteres aleatórios
  - Spam (propaganda, links suspeitos, repetição sem sentido)
  - Tentativa de inserir código (HTML, JavaScript, SQL, template injection)

NUNCA reprove:
  - Crítica legítima à gestão pública (mesmo que dura ou insatisfeita)
  - Opinião política ou ideológica expressada de forma civilizada
  - Questionamentos, sugestões, reclamações formais
  - Texto em português com erros gramaticais mas inteligível

Responda APENAS com JSON válido neste formato exato (sem markdown, sem explicação extra):
{"decisao":"reprovar"|"ok","categoria":"ofensivo"|"sem_nexo"|"spam"|"codigo_malicioso"|"ok","motivo":"..."}

O campo "motivo" deve ser em português, conciso (máx. 80 chars). Se decisao=ok, motivo pode ser null.`;

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ComentarioModeradorService {
  private readonly log = new Logger(ComentarioModeradorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
  ) {}

  /**
   * Avalia um comentário em 2 camadas.
   *
   * @param conteudo  Texto bruto do comentário (já validado tamanho/vazio pelo ComentariosService).
   * @param tenantId  Tenant atual — usado para checar flag iaChatHabilitada.
   * @returns ResultadoModeracao
   */
  async avaliar(conteudo: string, tenantId: string): Promise<ResultadoModeracao> {
    // ------------------------------------------------------------------
    // Camada 1 — Determinística (sempre roda; sem IA; sem latência)
    // ------------------------------------------------------------------
    if (temCodigoMalicioso(conteudo)) {
      return {
        decisao: 'reprovar',
        categoria: 'codigo_malicioso',
        motivo: 'Conteúdo contém código malicioso ou tentativa de injeção.',
      };
    }

    if (temBaixoCalao(conteudo)) {
      return {
        decisao: 'reprovar',
        categoria: 'baixo_calao',
        motivo: 'Comentário contém linguagem inapropriada ou palavrão.',
      };
    }

    if (temSpam(conteudo)) {
      return {
        decisao: 'reprovar',
        categoria: 'spam',
        motivo: 'Comentário identificado como spam (repetição, excesso de links ou caps).',
      };
    }

    // ------------------------------------------------------------------
    // Camada 2 — IA (somente se iaChatHabilitada no tenant)
    // ------------------------------------------------------------------
    const iaHabilitada = await this.iaHabilitadaParaTenant(tenantId);
    if (!iaHabilitada) {
      // IA desligada → passa para moderação humana
      return { decisao: 'pendente', categoria: 'ok', motivo: null };
    }

    return this.avaliarComIA(conteudo);
  }

  // ------------------------------------------------------------------ privado

  /** Verifica a flag iaChatHabilitada via platform() (cross-tenant permitido aqui — é o próprio registro do tenant). */
  private async iaHabilitadaParaTenant(tenantId: string): Promise<boolean> {
    try {
      const t = await this.prisma.platform().tenant.findUnique({
        where: { id: tenantId },
        select: { iaChatHabilitada: true },
      });
      return t?.iaChatHabilitada ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Camada 2: chama o Anthropic com timeout de 8 s.
   * Degrada graciosamente: qualquer erro ou JSON inválido → 'pendente'.
   */
  private async avaliarComIA(conteudo: string): Promise<ResultadoModeracao> {
    const texto = conteudo.slice(0, 1000); // anti-abuse de tokens

    try {
      const resposta = await Promise.race([
        this.anthropic.completar({
          system: SISTEMA_MODERACAO,
          user: `COMENTÁRIO PARA ANALISAR:\n${texto}`,
          maxTokens: 120,
          cacheSystem: true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8_000),
        ),
      ]);

      return this.parsearRespostaIA(resposta as string);
    } catch (err) {
      this.log.warn(
        `Moderação IA falhou (${(err as Error).message}) — passando para moderação humana.`,
      );
      return { decisao: 'pendente', categoria: 'ok', motivo: null };
    }
  }

  /**
   * Parseia o JSON retornado pela IA.
   * Extrai o JSON mesmo que venha embrulhado em markdown (```json … ```).
   * Em caso de parse inválido → 'pendente' (degradação graciosa).
   */
  private parsearRespostaIA(texto: string): ResultadoModeracao {
    try {
      // Remove possível cerca de markdown
      const json = texto.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(json) as {
        decisao?: string;
        categoria?: string;
        motivo?: string | null;
      };

      if (parsed.decisao === 'reprovar') {
        return {
          decisao: 'reprovar',
          categoria: (parsed.categoria ?? 'ofensivo').slice(0, 50),
          motivo: parsed.motivo ? String(parsed.motivo).slice(0, 200) : 'Reprovado pelo moderador automático.',
        };
      }

      // decisao === 'ok' ou qualquer outro valor → pendente
      return { decisao: 'pendente', categoria: 'ok', motivo: null };
    } catch {
      this.log.warn('Resposta IA não é JSON válido — passando para moderação humana.');
      return { decisao: 'pendente', categoria: 'ok', motivo: null };
    }
  }
}
