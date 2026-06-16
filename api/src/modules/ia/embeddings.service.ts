import { Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '../../common/tenant/tenant.context';
import { TenantIaConfigService } from './tenant-ia-config.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * Geração de embeddings para o RAG semântico (Camada 4).
 * Suporta dois provedores: Voyage AI e OpenAI.
 *
 * "Global + override opcional": por padrão usa as variáveis de ambiente
 * (provedor/chave globais). Se a ENTIDADE atual (TenantContext) tiver um
 * override em tenant_ia_config (provedor e/ou chave própria), ele prevalece.
 *
 * DEGRADA: sem nenhuma chave (nem do tenant, nem global), retorna null e o RAG
 * cai para FTS. Dimensão: sempre 1024 (voyage-3 nativo; openai via dimensions).
 */
@Injectable()
export class EmbeddingsService {
  private readonly log = new Logger(EmbeddingsService.name);

  constructor(
    private readonly tenantIaConfig: TenantIaConfigService,
    private readonly platform: PlatformSettingsService,
  ) {}

  /** True se há provedor configurado GLOBALMENTE (gate barato, sem tenant). */
  get configurado(): boolean {
    return !!(process.env.VOYAGE_API_KEY || process.env.OPENAI_API_KEY);
  }

  /** Provedor GLOBAL efetivo (env). Override por tenant é resolvido em runtime. */
  get provider(): 'voyage' | 'openai' {
    const explicit = (process.env.EMBEDDINGS_PROVIDER ?? '').toLowerCase();
    if (explicit === 'openai') return 'openai';
    if (explicit === 'voyage') return 'voyage';
    if (process.env.VOYAGE_API_KEY) return 'voyage';
    return 'openai';
  }

  /** Modelo GLOBAL efetivo. */
  get modelo(): string {
    return modeloDoProvider(this.provider, true);
  }

  /** Dimensão fixada em 1024 (voyage-3 nativo; openai via dimensions:1024). */
  get dimensoes(): number {
    return 1024;
  }

  /**
   * True se há provedor/chave para ESTE tenant (override próprio OU global).
   * Async porque consulta o override (cacheado) do tenant.
   */
  async configuradoParaTenant(tenantId: string): Promise<boolean> {
    const ef = await this.efetivoParaTenant(tenantId);
    return !!ef.apiKey;
  }

  /** Info efetiva (provider/modelo/configurado) para exibição/status por tenant. */
  async infoParaTenant(tenantId: string): Promise<{ configurado: boolean; provider: string; modelo: string }> {
    const ef = await this.efetivoParaTenant(tenantId);
    return {
      configurado: !!ef.apiKey,
      provider: ef.apiKey ? ef.provider : 'none',
      modelo: ef.apiKey ? ef.modelo : '',
    };
  }

  /**
   * Gera vetores para um lote de textos, usando a config efetiva do tenant atual
   * (TenantContext) — override próprio se houver, senão o global do ambiente.
   * Retorna null se não configurado ou em caso de falha (degradação silenciosa).
   */
  async embed(textos: string[]): Promise<number[][] | null> {
    if (textos.length === 0) return null;

    const tid = TenantContext.tenantId();
    const ef = await this.efetivoParaTenant(tid ?? undefined);
    if (!ef.apiKey) return null;

    try {
      // Retry com backoff em rate limit (429) — o free tier da Voyage sem cartão
      // fica em 3 RPM; o retry deixa a indexação concluir (mais devagar).
      const MAX_RETRY = 5;
      let vecs: number[][] | null = null;
      for (let tentativa = 0; tentativa <= MAX_RETRY; tentativa++) {
        try {
          vecs =
            ef.provider === 'openai'
              ? await this.embedOpenAI(textos, ef.apiKey, ef.modelo)
              : await this.embedVoyage(textos, ef.apiKey, ef.modelo);
          break;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if (status === 429 && tentativa < MAX_RETRY) {
            const esperaMs = (err as { retryAfterMs?: number })?.retryAfterMs ?? 21_000;
            this.log.warn(`Rate limit (429) no ${ef.provider}; aguardando ${Math.round(esperaMs / 1000)}s e retentando (${tentativa + 1}/${MAX_RETRY}).`);
            await new Promise((r) => setTimeout(r, esperaMs));
            continue;
          }
          throw err;
        }
      }
      if (!vecs) return null;

      for (const v of vecs) {
        if (v.length !== this.dimensoes) {
          this.log.warn(
            `Embedding com ${v.length} dims (esperado ${this.dimensoes}). Provedor: ${ef.provider}, modelo: ${ef.modelo}.`,
          );
          break;
        }
      }
      return vecs;
    } catch (e) {
      this.log.warn(`Falha ao gerar embeddings (${ef.provider}): ${String(e)}`);
      return null;
    }
  }

  // ---------------------------------------------------------------- resolução

  /**
   * Resolve a config efetiva (provider/modelo/chave) para um tenant:
   * override próprio (tenant_ia_config) sobre o global (env).
   */
  private async efetivoParaTenant(
    tenantId?: string,
  ): Promise<{ provider: 'voyage' | 'openai'; modelo: string; apiKey: string | null }> {
    const g = await this.platform.iaGlobal();
    const ov = tenantId ? await this.tenantIaConfig.override(tenantId) : null;

    // Precedência: entidade → global do painel → env.
    const provider: 'voyage' | 'openai' =
      ov?.embeddingsProvider ?? (g.embeddingsProvider as 'voyage' | 'openai' | null) ?? this.provider;
    const apiKey =
      provider === 'voyage'
        ? (ov?.voyageKey ?? g.voyageKey ?? process.env.VOYAGE_API_KEY ?? null)
        : (ov?.openaiKey ?? g.openaiKey ?? process.env.OPENAI_API_KEY ?? null);

    // Modelo: global do painel > EMBEDDINGS_MODEL (env, se provedor não sobreposto) > default.
    const modelo = g.embeddingsModel || modeloDoProvider(provider, !ov?.embeddingsProvider);

    return { provider, modelo, apiKey };
  }

  // ---------------------------------------------------------------- Voyage AI

  private async embedVoyage(textos: string[], apiKey: string, modelo: string): Promise<number[][] | null> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: textos, model: modelo }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      if (res.status === 429) throw this.rateLimitErr(res);
      this.log.warn(`Voyage retornou ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }

    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }

  /** Erro de rate limit com status + retryAfterMs (do header Retry-After, se houver). */
  private rateLimitErr(res: Response): Error & { status: number; retryAfterMs: number } {
    const ra = Number(res.headers.get('retry-after'));
    const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 21_000;
    const e = new Error('rate_limit') as Error & { status: number; retryAfterMs: number };
    e.status = 429;
    e.retryAfterMs = retryAfterMs;
    return e;
  }

  // ---------------------------------------------------------------- OpenAI

  private async embedOpenAI(textos: string[], apiKey: string, modelo: string): Promise<number[][] | null> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // dimensions: 1024 — suportado por text-embedding-3-small/large (reduz custo + dim).
      body: JSON.stringify({ input: textos, model: modelo, dimensions: 1024 }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      if (res.status === 429) throw this.rateLimitErr(res);
      this.log.warn(`OpenAI retornou ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }

    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}

/** Modelo default por provedor; aplica EMBEDDINGS_MODEL global quando permitido. */
function modeloDoProvider(provider: 'voyage' | 'openai', permiteEnvOverride: boolean): string {
  const override = permiteEnvOverride ? process.env.EMBEDDINGS_MODEL : undefined;
  if (provider === 'openai') return override ?? 'text-embedding-3-small';
  return override ?? 'voyage-3';
}
