import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappConfigService, SalvarConfigDto } from './whatsapp-config.service';
import { WhatsappService } from './whatsapp.service';

// Eventos que serão provisionados como sub-webhooks na Z-API
const EVENTOS_WEBHOOK: Record<string, string> = {
  'on-receive': 'update-webhook-received',
  'message-status': 'update-webhook-message-status',
  'on-send': 'update-webhook-delivery',
  'connected': 'update-webhook-connected',
  'disconnected': 'update-webhook-disconnected',
};

/**
 * Console admin para configuração de WhatsApp por tenant.
 * RBAC: ADMIN_PREFEITURA (e SUPER_ADMIN por herança no RolesGuard).
 *
 * Regras de segurança:
 *  - NUNCA retorna tokens em claro (só flags booleanos).
 *  - Todas as gravações auditadas em audit_log.
 *  - Validação de input antes de gravar.
 */
@Controller('admin/whatsapp')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA)
export class WhatsappAdminController {
  private readonly log = new Logger(WhatsappAdminController.name);

  constructor(
    private readonly configService: WhatsappConfigService,
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  /** GET /admin/whatsapp/config — retorna config mascarada (sem tokens). */
  @Get('config')
  async obterConfig() {
    const tenantId = TenantContext.tenantId()!;
    return this.configService.configMascarada(tenantId);
  }

  /**
   * PUT /admin/whatsapp/config — grava configuração cifrada.
   * Gera zapiWebhookSecret automaticamente se provider=zapi e ainda ausente.
   */
  @Put('config')
  async salvarConfig(@Body() body: SalvarConfigDto) {
    const tenantId = TenantContext.tenantId()!;

    const provider = body.provider;
    if (provider && !['zapi', 'evolution', 'meta'].includes(provider)) {
      throw new BadRequestException(`Provider inválido: ${provider}`);
    }
    if (body.fallbackProvider && !['zapi', 'evolution', 'meta'].includes(body.fallbackProvider)) {
      throw new BadRequestException(`Fallback provider inválido: ${body.fallbackProvider}`);
    }

    await this.configService.salvar(tenantId, body);

    await this.auditar(tenantId, 'WHATSAPP_CONFIG_ATUALIZADA', {
      provider: body.provider,
      fallbackProvider: body.fallbackProvider,
    });

    return { ok: true, config: await this.configService.configMascarada(tenantId) };
  }

  /** GET /admin/whatsapp/status — verifica conexão do provider ativo. */
  @Get('status')
  async status() {
    const tenantId = TenantContext.tenantId()!;
    try {
      const provider = await this.whatsappService.providerDoTenant(tenantId);
      return await provider.getStatus();
    } catch (e) {
      // Nunca 500: status é diagnóstico. Retorna erro legível (sem segredo).
      return { conectado: false, detalhe: (e as Error).message };
    }
  }

  /**
   * POST /admin/whatsapp/provisionar-webhooks
   * Chama os endpoints PUT update-webhook-* da Z-API para configurar
   * as URLs de webhook por evento.
   *
   * URL base do backend: PUBLIC_API env.
   * Slug do tenant: resolvido via platform() cross-tenant.
   *
   * Body aceito: { useEveryWebhook?: boolean } — se true, usa update-every-webhooks
   * com uma URL única em vez de sub-paths.
   *
   * Confirmar campo `value` na doc da Z-API (developer.z-api.io).
   * Implementação segue o runbook: body `{ value: url }`, header Client-Token.
   */
  @Post('provisionar-webhooks')
  async provisionarWebhooks(@Body() body: { useEveryWebhook?: boolean }) {
    const tenantId = TenantContext.tenantId()!;
    const cfg = await this.configService.configDoTenant(tenantId);

    if (cfg.provider !== 'zapi') {
      throw new BadRequestException('Provisionamento de webhooks só disponível para provider Z-API.');
    }
    if (!cfg.zapiInstanceId || !cfg.zapiToken) {
      throw new BadRequestException('Z-API não configurada. Defina instanceId e token primeiro (clientToken é opcional).');
    }
    if (!cfg.zapiWebhookSecret) {
      throw new BadRequestException('Webhook secret não gerado. Salve a config com provider=zapi primeiro.');
    }

    const publicApi = process.env.PUBLIC_API;
    if (!publicApi) {
      throw new BadRequestException('PUBLIC_API não configurada no servidor.');
    }

    // Resolve slug do tenant (cross-tenant — para montar a URL)
    const tenant = await this.prisma.platform().tenant.findFirst({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant?.slug) {
      throw new BadRequestException('Slug do tenant não encontrado.');
    }

    const base = `${cfg.zapiBaseUrl ?? 'https://api.z-api.io/instances'}/${cfg.zapiInstanceId}/token/${cfg.zapiToken}`;
    const headers = { 'Client-Token': cfg.zapiClientToken, 'Content-Type': 'application/json' };
    const resultados: Record<string, 'ok' | string> = {};

    if (body.useEveryWebhook) {
      // Alternativa: uma URL única, tipo discriminado pelo campo `type`
      const url = `${publicApi}/webhooks/zapi/${tenant.slug}/${cfg.zapiWebhookSecret}`;
      try {
        await firstValueFrom(
          this.http.put(
            `${base}/update-every-webhooks`,
            { value: url }, // confirmar campo na doc Z-API
            { headers, timeout: 10000 },
          ),
        );
        resultados['update-every-webhooks'] = 'ok';
      } catch (e) {
        resultados['update-every-webhooks'] = (e as Error).message;
      }
    } else {
      // Sub-paths por evento (recomendado — roteamento mais claro)
      for (const [subPath, endpoint] of Object.entries(EVENTOS_WEBHOOK)) {
        const url = `${publicApi}/webhooks/zapi/${tenant.slug}/${cfg.zapiWebhookSecret}/${subPath}`;
        try {
          await firstValueFrom(
            this.http.put(
              `${base}/${endpoint}`,
              { value: url }, // confirmar campo na doc Z-API — runbook indica 'value'
              { headers, timeout: 10000 },
            ),
          );
          resultados[endpoint] = 'ok';
        } catch (e) {
          resultados[endpoint] = (e as Error).message;
          this.log.warn(`Falha ao provisionar webhook ${endpoint}: ${(e as Error).message}`);
        }
      }
    }

    await this.auditar(tenantId, 'WHATSAPP_WEBHOOKS_PROVISIONADOS', { resultados });
    return { ok: true, resultados };
  }

  /**
   * POST /admin/whatsapp/enviar-teste — envia mensagem de validação das credenciais.
   * Body: { numero: string, texto?: string }
   */
  @Post('enviar-teste')
  async enviarTeste(@Body() body: { numero: string; texto?: string }) {
    if (!body.numero) throw new BadRequestException('Número é obrigatório.');

    const tenantId = TenantContext.tenantId()!;
    const texto = body.texto ?? 'Teste de configuração WhatsApp — Portal Municipal.';

    const r = await TenantContext.run({ tenantId }, () =>
      this.whatsappService.enviar(body.numero, texto),
    );

    await this.auditar(tenantId, 'WHATSAPP_TESTE_ENVIADO', {
      numero_mascarado: `••••${body.numero.replace(/\D/g, '').slice(-4)}`,
    });

    return { ok: true, id: r.id };
  }

  // ---------------------------------------------------------------- helpers

  private async auditar(
    tenantId: string,
    acao: string,
    dados: object,
  ): Promise<void> {
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao,
            entidade: 'whatsapp_config',
            entidadeId: null,
            dados: dados as object,
          } as any,
        }),
      );
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${(e as Error).message}`);
    }
  }
}
