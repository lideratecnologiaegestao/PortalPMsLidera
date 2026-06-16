import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { TenantContext } from '../../common/tenant/tenant.context';
import { TenantIaConfigService } from './tenant-ia-config.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * Cliente da API Anthropic. Centraliza modelo, chave e PROMPT CACHING. Se a
 * chave não estiver configurada, lança 503 (degradação graciosa).
 *
 * Resolução de chave/modelo (precedência): override da ENTIDADE (tenant_ia_config)
 * → GLOBAL do painel (platform_settings) → `.env`. Assim dá p/ trocar a chave/modelo
 * no painel sem mexer no .env nem recriar o container.
 */
@Injectable()
export class AnthropicService {
  /** Cache de clients por chave. */
  private clients = new Map<string, Anthropic>();

  constructor(
    private readonly tenantIaConfig: TenantIaConfigService,
    private readonly platform: PlatformSettingsService,
  ) {}

  get configurado(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /** Resolve client + modelo efetivos (entidade → global → env). */
  private async get(): Promise<{ client: Anthropic; model: string }> {
    const g = await this.platform.iaGlobal();
    const tid = TenantContext.tenantId();
    let apiKey: string | null = null;
    if (tid) {
      const ov = await this.tenantIaConfig.override(tid);
      if (ov?.anthropicKey) apiKey = ov.anthropicKey;
    }
    apiKey = apiKey ?? g.anthropicKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    if (!apiKey) {
      throw new ServiceUnavailableException('IA não configurada (chave Anthropic ausente).');
    }
    // `||` p/ cobrir IA_MODEL definido porém VAZIO no .env.
    const model = g.iaModel || (process.env.IA_MODEL || '').trim() || 'claude-sonnet-4-6';
    let client = this.clients.get(apiKey);
    if (!client) {
      client = new Anthropic({ apiKey });
      this.clients.set(apiKey, client);
    }
    return { client, model };
  }

  /**
   * Completa uma mensagem. `cacheSystem` marca o system prompt com
   * cache_control ephemeral — o prefixo estático (instruções/taxonomia) é
   * reaproveitado entre chamadas, reduzindo custo e latência.
   */
  async completar(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    cacheSystem?: boolean;
  }): Promise<string> {
    const system = opts.cacheSystem
      ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
      : opts.system;

    const { client, model } = await this.get();
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: system as never,
      messages: [{ role: 'user', content: opts.user }],
    });

    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  /**
   * Completa uma mensagem com TOOL USE: o modelo pode chamar ferramentas
   * (ex.: consultas fiscais determinísticas) e nós executamos via `executar`,
   * devolvendo o resultado até o modelo redigir a resposta final. Cap de turnos
   * evita loop. Os números vêm das ferramentas, não do texto (sem alucinação).
   */
  async completarComFerramentas(opts: {
    system: string;
    user: string;
    tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
    executar: (nome: string, input: Record<string, unknown>) => Promise<unknown>;
    maxTokens?: number;
    cacheSystem?: boolean;
    maxTurnos?: number;
  }): Promise<string> {
    const { client, model } = await this.get();
    const system = opts.cacheSystem
      ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
      : opts.system;

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.user }];
    const maxTurnos = opts.maxTurnos ?? 4;

    for (let turno = 0; turno < maxTurnos; turno++) {
      const res = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 800,
        system: system as never,
        tools: opts.tools as never,
        messages,
      });

      if (res.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: res.content });
        const resultados: Anthropic.ToolResultBlockParam[] = [];
        for (const bloco of res.content) {
          if (bloco.type === 'tool_use') {
            let resultado: unknown;
            try {
              resultado = await opts.executar(bloco.name, (bloco.input ?? {}) as Record<string, unknown>);
            } catch (e) {
              resultado = { erro: String((e as Error).message) };
            }
            resultados.push({
              type: 'tool_result',
              tool_use_id: bloco.id,
              content: JSON.stringify(resultado),
            });
          }
        }
        messages.push({ role: 'user', content: resultados });
        continue;
      }

      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    }
    return 'Não consegui concluir a consulta no momento.';
  }

  /** OCR de um documento via visão do modelo. Degrada (503) sem chave. */
  async ocr(imagemBase64: string, mediaType: string): Promise<string> {
    const { client, model } = await this.get();
    const res = await client.messages.create({
      model,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as never, data: imagemBase64 },
            },
            {
              type: 'text',
              text: 'Extraia todo o texto legível deste documento, preservando a ordem de leitura. Responda apenas com o texto extraído.',
            },
          ],
        },
      ],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
}
