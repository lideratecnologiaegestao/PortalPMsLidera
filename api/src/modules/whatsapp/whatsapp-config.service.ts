import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { cifrar, decifrar } from '../../common/crypto/secret-box.util';
import { ProviderNome } from './whatsapp-provider.interface';

export interface TenantWhatsappConfigDecifrada {
  tenantId: string;
  provider: ProviderNome;
  fallbackProvider?: ProviderNome;
  // Z-API
  zapiBaseUrl?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  zapiWebhookSecret?: string;
  // Evolution
  evolutionApiUrl?: string;
  evolutionInstance?: string;
  evolutionApiKey?: string;
  ativo: boolean;
}

export interface SalvarConfigDto {
  provider?: string;
  fallbackProvider?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  evolutionApiUrl?: string;
  evolutionInstance?: string;
  evolutionApiKey?: string;
  ativo?: boolean;
}

/**
 * Gerencia a configuração de WhatsApp por tenant.
 * Tokens são cifrados em repouso (AES-256-GCM via secret-box.util).
 * Nunca retorna tokens em claro para o exterior — use configDoTenant()
 * internamente e configMascarada() para respostas de API.
 *
 * Fallback para variáveis de ambiente globais: permite dev/single-tenant
 * sem linha no banco.
 */
@Injectable()
export class WhatsappConfigService {
  private readonly log = new Logger(WhatsappConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna config decifrada do tenant atual (TenantContext).
   * Fallback: lê do .env quando não há linha no banco.
   */
  async configDoTenant(tenantId: string): Promise<TenantWhatsappConfigDecifrada> {
    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappConfig.findFirst(),
    );
    return this.rowParaConfig(tenantId, row);
  }

  /**
   * Resolve config pelo slug do tenant (cross-tenant — para webhook entry-point).
   * Justificativa cross-tenant: webhook chega sem TenantContext; precisamos
   * resolver qual tenant pertence ao slug para validar o secret.
   */
  async configPorSlug(slug: string): Promise<TenantWhatsappConfigDecifrada | null> {
    const tenant = await this.prisma
      .platform()
      .tenant.findFirst({
        where: { slug },
        select: { id: true },
      });
    if (!tenant) return null;
    return this.configDoTenant(tenant.id);
  }

  /**
   * Versão mascarada para retornar na API admin (sem tokens em claro).
   */
  async configMascarada(tenantId: string) {
    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappConfig.findFirst(),
    );
    return {
      provider: row?.provider ?? process.env.WHATSAPP_PROVIDER ?? 'evolution',
      fallbackProvider: row?.fallbackProvider ?? process.env.WHATSAPP_FALLBACK_PROVIDER ?? null,
      zapiInstanceId: row?.zapiInstanceId ?? process.env.ZAPI_INSTANCE_ID ?? null,
      zapiTokenDefinido: !!(row?.zapiTokenCifrado ?? process.env.ZAPI_TOKEN),
      zapiClientTokenDefinido: !!(row?.zapiClientTokenCifrado ?? process.env.ZAPI_CLIENT_TOKEN),
      zapiWebhookSecretDefinido: !!(row?.zapiWebhookSecret ?? process.env.ZAPI_WEBHOOK_SECRET),
      evolutionApiUrl: row?.evolutionApiUrl ?? process.env.EVOLUTION_API_URL ?? null,
      evolutionInstance: row?.evolutionInstance ?? process.env.EVOLUTION_INSTANCE ?? null,
      evolutionApiKeyDefinida: !!(row?.evolutionApiKeyCifrado ?? process.env.EVOLUTION_API_KEY),
      ativo: row?.ativo ?? true,
    };
  }

  /**
   * Grava/atualiza a config do tenant (cifra tokens, gera webhookSecret se Z-API e ausente).
   */
  async salvar(tenantId: string, dto: SalvarConfigDto): Promise<void> {
    const atual = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappConfig.findFirst(),
    );

    const isZapi = (dto.provider ?? atual?.provider ?? 'evolution') === 'zapi';

    // Gera webhook secret se provider for Z-API e ainda não existe
    let webhookSecret = atual?.zapiWebhookSecret ?? undefined;
    if (isZapi && !webhookSecret) {
      webhookSecret = randomBytes(32).toString('hex');
    }

    const data: Record<string, unknown> = {
      provider: dto.provider ?? atual?.provider ?? 'evolution',
      fallbackProvider: dto.fallbackProvider ?? atual?.fallbackProvider ?? null,
      zapiInstanceId: dto.zapiInstanceId ?? atual?.zapiInstanceId ?? null,
      evolutionApiUrl: dto.evolutionApiUrl ?? atual?.evolutionApiUrl ?? null,
      evolutionInstance: dto.evolutionInstance ?? atual?.evolutionInstance ?? null,
      ativo: dto.ativo ?? atual?.ativo ?? true,
      zapiWebhookSecret: webhookSecret ?? null,
    };

    // Só atualiza tokens se novos valores foram fornecidos
    if (dto.zapiToken) data.zapiTokenCifrado = cifrar(dto.zapiToken);
    if (dto.zapiClientToken) data.zapiClientTokenCifrado = cifrar(dto.zapiClientToken);
    if (dto.evolutionApiKey) data.evolutionApiKeyCifrado = cifrar(dto.evolutionApiKey);

    await TenantContext.run({ tenantId }, async () => {
      if (atual) {
        await this.prisma.db.tenantWhatsappConfig.update({
          where: { tenantId },
          data: data as any,
        });
      } else {
        await this.prisma.db.tenantWhatsappConfig.create({
          data: { tenantId, ...data } as any,
        });
      }
    });
  }

  // ---------------------------------------------------------------- helpers

  private rowParaConfig(
    tenantId: string,
    row: {
      provider: string;
      fallbackProvider?: string | null;
      zapiInstanceId?: string | null;
      zapiTokenCifrado?: string | null;
      zapiClientTokenCifrado?: string | null;
      zapiWebhookSecret?: string | null;
      evolutionApiUrl?: string | null;
      evolutionInstance?: string | null;
      evolutionApiKeyCifrado?: string | null;
      ativo: boolean;
    } | null,
  ): TenantWhatsappConfigDecifrada {
    // Variáveis de ambiente como fallback (dev/single-tenant)
    const zapiBase = process.env.ZAPI_BASE_URL ?? 'https://api.z-api.io/instances';

    return {
      tenantId,
      provider: (row?.provider ?? process.env.WHATSAPP_PROVIDER ?? 'evolution') as ProviderNome,
      fallbackProvider: (row?.fallbackProvider ?? process.env.WHATSAPP_FALLBACK_PROVIDER ?? undefined) as ProviderNome | undefined,
      zapiBaseUrl: zapiBase,
      zapiInstanceId: row?.zapiInstanceId ?? process.env.ZAPI_INSTANCE_ID ?? undefined,
      zapiToken: row?.zapiTokenCifrado ? this.decifrarSafe(row.zapiTokenCifrado) : (process.env.ZAPI_TOKEN ?? undefined),
      zapiClientToken: row?.zapiClientTokenCifrado ? this.decifrarSafe(row.zapiClientTokenCifrado) : (process.env.ZAPI_CLIENT_TOKEN ?? undefined),
      zapiWebhookSecret: row?.zapiWebhookSecret ?? process.env.ZAPI_WEBHOOK_SECRET ?? undefined,
      evolutionApiUrl: row?.evolutionApiUrl ?? process.env.EVOLUTION_API_URL ?? undefined,
      evolutionInstance: row?.evolutionInstance ?? process.env.EVOLUTION_INSTANCE ?? undefined,
      evolutionApiKey: row?.evolutionApiKeyCifrado ? this.decifrarSafe(row.evolutionApiKeyCifrado) : (process.env.EVOLUTION_API_KEY ?? undefined),
      ativo: row?.ativo ?? true,
    };
  }

  private decifrarSafe(blob: string): string | undefined {
    try {
      return decifrar(blob);
    } catch (e) {
      this.log.warn(`Falha ao decifrar segredo de WhatsApp: ${(e as Error).message}`);
      return undefined;
    }
  }
}
