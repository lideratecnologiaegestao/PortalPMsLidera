import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { cifrar, decifrar } from '../../common/crypto/secret-box.util';

/** Default global do teto de chunks (espelha o indexador; usado quando não há override). */
export const MAX_CHUNKS_DEFAULT = 2_000;

/** Override decifrado de um tenant (apenas o que foi preenchido; resto null). */
export interface IaOverride {
  iaMaxChunks: number | null;
  embeddingsProvider: 'voyage' | 'openai' | null;
  voyageKey: string | null;
  anthropicKey: string | null;
  openaiKey: string | null;
}

/** DTO de gravação. Campos:
 *  - undefined  → mantém o valor atual
 *  - ''  (string vazia)  → LIMPA (volta a usar o global) — só para chaves/provider
 *  - null (iaMaxChunks)  → LIMPA o teto (volta ao default global)
 *  - valor      → define (chaves são cifradas)
 */
export interface SalvarIaConfigDto {
  iaMaxChunks?: number | null;
  embeddingsProvider?: string;
  voyageApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ativo?: boolean;
}

/**
 * Configuração de IA POR TENANT (camada 4 / chatbot).
 *
 * Modelo "global + override opcional": o `.env` global continua sendo o padrão;
 * cada entidade só sobrepõe o que preencher (limite de chunks, provedor de
 * embeddings, e chaves Voyage/Anthropic/OpenAI). As chaves são cifradas em
 * repouso (AES-256-GCM via secret-box) e NUNCA retornadas em claro pela API.
 *
 * Acesso por RLS (this.prisma.db dentro de TenantContext). Cache curto em
 * memória para não bater no banco a cada lote de embeddings.
 */
@Injectable()
export class TenantIaConfigService {
  private readonly log = new Logger(TenantIaConfigService.name);

  /** Cache de override decifrado por tenant (TTL curto — hot path de embeddings). */
  private cache = new Map<string, { val: IaOverride | null; exp: number }>();
  private readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /** Invalida o cache de um tenant (após gravar). */
  private invalidar(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Override decifrado do tenant (ou null se não houver linha). Cacheado.
   * Lê via RLS no contexto do tenant.
   */
  async override(tenantId: string): Promise<IaOverride | null> {
    const hit = this.cache.get(tenantId);
    if (hit && hit.exp > nowMs()) return hit.val;

    const row = await this.lerRow(tenantId);
    const val: IaOverride | null = row
      ? {
          iaMaxChunks: row.iaMaxChunks ?? null,
          embeddingsProvider: (row.embeddingsProvider as 'voyage' | 'openai' | null) ?? null,
          voyageKey: this.decifrarSafe(row.voyageApiKeyCifrado),
          anthropicKey: this.decifrarSafe(row.anthropicApiKeyCifrado),
          openaiKey: this.decifrarSafe(row.openaiApiKeyCifrado),
        }
      : null;

    this.cache.set(tenantId, { val, exp: nowMs() + this.TTL_MS });
    return val;
  }

  /** Teto de chunks efetivo do tenant (override ?? default global). */
  async maxChunks(tenantId: string): Promise<number> {
    const ov = await this.override(tenantId);
    return ov?.iaMaxChunks ?? MAX_CHUNKS_DEFAULT;
  }

  /**
   * Versão mascarada para o Gerenciador (sem segredo em claro):
   * mostra o que está sobreposto, o valor efetivo e a origem (entidade|global).
   */
  async mascarada(tenantId: string) {
    const ov = await this.override(tenantId);
    const envProvider = (process.env.EMBEDDINGS_PROVIDER ?? (process.env.VOYAGE_API_KEY ? 'voyage' : process.env.OPENAI_API_KEY ? 'openai' : null)) as
      | 'voyage'
      | 'openai'
      | null;

    const providerEfetivo = ov?.embeddingsProvider ?? envProvider;
    const voyageDefinida = !!ov?.voyageKey || !!process.env.VOYAGE_API_KEY;
    const openaiDefinida = !!ov?.openaiKey || !!process.env.OPENAI_API_KEY;
    const anthropicDefinida = !!ov?.anthropicKey || !!process.env.ANTHROPIC_API_KEY;

    return {
      // valores sobrepostos (null = herda do global)
      iaMaxChunks: ov?.iaMaxChunks ?? null,
      embeddingsProvider: ov?.embeddingsProvider ?? null,
      // existe chave PRÓPRIA da entidade? (não revela o valor)
      voyageProprio: !!ov?.voyageKey,
      anthropicProprio: !!ov?.anthropicKey,
      openaiProprio: !!ov?.openaiKey,
      // efetivo (o que de fato vai valer)
      efetivo: {
        maxChunks: ov?.iaMaxChunks ?? MAX_CHUNKS_DEFAULT,
        maxChunksFonte: ov?.iaMaxChunks != null ? 'entidade' : 'global',
        provider: providerEfetivo,
        providerFonte: ov?.embeddingsProvider ? 'entidade' : 'global',
        embeddingsDefinido: voyageDefinida || openaiDefinida,
        anthropicDefinido: anthropicDefinida,
      },
      // defaults globais (para o painel mostrar de onde herda)
      global: {
        maxChunks: MAX_CHUNKS_DEFAULT,
        provider: envProvider,
        voyageDefinida: !!process.env.VOYAGE_API_KEY,
        openaiDefinida: !!process.env.OPENAI_API_KEY,
        anthropicDefinida: !!process.env.ANTHROPIC_API_KEY,
      },
    };
  }

  /**
   * Grava/atualiza o override do tenant. Chaves são cifradas; '' limpa (volta ao
   * global). Campos undefined preservam o valor atual.
   */
  async salvar(tenantId: string, dto: SalvarIaConfigDto): Promise<void> {
    const atual = await this.lerRow(tenantId);

    const data: Record<string, unknown> = {
      ativo: dto.ativo ?? atual?.ativo ?? true,
    };

    // iaMaxChunks: null limpa, número define, undefined mantém
    if (dto.iaMaxChunks !== undefined) {
      data.iaMaxChunks = dto.iaMaxChunks === null ? null : Math.trunc(dto.iaMaxChunks);
    }

    // provider: '' limpa, valor define, undefined mantém
    if (dto.embeddingsProvider !== undefined) {
      const p = dto.embeddingsProvider.trim().toLowerCase();
      data.embeddingsProvider = p === '' ? null : p;
    }

    aplicarChave(data, 'voyageApiKeyCifrado', dto.voyageApiKey);
    aplicarChave(data, 'anthropicApiKeyCifrado', dto.anthropicApiKey);
    aplicarChave(data, 'openaiApiKeyCifrado', dto.openaiApiKey);

    await TenantContext.run({ tenantId }, async () => {
      if (atual) {
        await this.prisma.db.tenantIaConfig.update({ where: { tenantId }, data: data as any });
      } else {
        await this.prisma.db.tenantIaConfig.create({ data: { tenantId, ...data } as any });
      }
    });

    this.invalidar(tenantId);
  }

  // ---------------------------------------------------------------- helpers

  private async lerRow(tenantId: string) {
    return TenantContext.run({ tenantId }, () => this.prisma.db.tenantIaConfig.findFirst());
  }

  private decifrarSafe(blob: string | null | undefined): string | null {
    if (!blob) return null;
    try {
      return decifrar(blob);
    } catch (e) {
      this.log.warn(`Falha ao decifrar chave de IA do tenant: ${(e as Error).message}`);
      return null;
    }
  }
}

/** Aplica a regra de gravação de uma chave cifrada: '' limpa, valor cifra, undefined mantém. */
function aplicarChave(data: Record<string, unknown>, campo: string, valor?: string): void {
  if (valor === undefined) return; // mantém
  const v = valor.trim();
  data[campo] = v === '' ? null : cifrar(v);
}

/** now() isolado — Date.now é proibido em alguns sandboxes; aqui é runtime normal. */
function nowMs(): number {
  return Date.now();
}
