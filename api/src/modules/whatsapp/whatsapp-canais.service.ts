import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { cifrar, decifrar } from '../../common/crypto/secret-box.util';

// ---------------------------------------------------------------- DTOs

export interface CriarCanalDto {
  label: string;
  /** 'whatsapp' | 'instagram' | 'messenger' | 'telegram'. */
  tipo?: string;
  /** Obrigatório para WhatsApp/Instagram/Messenger; opcional para Telegram. */
  metaPhoneNumberId?: string;
  metaWabaId?: string;
  metaToken: string;
  metaAppSecret?: string;
  metaVerifyToken?: string;
  secretariaId?: string;
  ativo?: boolean;
  ordem?: number;
}

export interface AtualizarCanalDto {
  label?: string;
  /** 'whatsapp' ou 'instagram'. */
  tipo?: string;
  metaPhoneNumberId?: string;
  metaWabaId?: string;
  /** Quando enviado, substitui o token cifrado em repouso. */
  metaToken?: string;
  /** Quando enviado, substitui o appSecret cifrado em repouso. */
  metaAppSecret?: string;
  metaVerifyToken?: string;
  secretariaId?: string | null;
  ativo?: boolean;
  ordem?: number;
}

export interface CanalDecifrado {
  id: string;
  tenantId: string;
  label: string;
  provider: string;
  /** 'whatsapp' | 'instagram' | 'messenger' | 'telegram' — migration 082/083. */
  tipo: string;
  /** Nulo para canais Telegram (que usam apenas bot token, não phone number). */
  metaPhoneNumberId: string | null;
  metaWabaId?: string | null;
  metaToken?: string | null;
  metaAppSecret?: string | null;
  metaVerifyToken?: string | null;
  webhookSecret: string;
  secretariaId?: string | null;
  ativo: boolean;
  ordem: number;
  atualizadoEm: Date;
}

/**
 * Gerencia os canais WhatsApp Multi-número Meta por tenant.
 *
 * Regras de segurança:
 *  - Tokens NUNCA retornados em claro — use `canalMascarado()` nas respostas de API.
 *  - `configDoCanal()` é de uso INTERNO (envio/webhook); injeta credenciais decifradas.
 *  - Resolução cross-tenant por webhook_secret (único global): justificada pois o
 *    webhook chega sem TenantContext; somente depois de resolver o canal o contexto é criado.
 */
@Injectable()
export class WhatsappCanaisService {
  private readonly log = new Logger(WhatsappCanaisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  // ---------------------------------------------------------------- leitura (mascarada — para API)

  async listar(tenantId: string) {
    const rows = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findMany({
        orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
      }),
    );
    return rows.map((r) => this.mascarar(r));
  }

  async buscarPorId(tenantId: string, id: string) {
    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundException(`Canal ${id} não encontrado.`);
    return this.mascarar(row);
  }

  // ---------------------------------------------------------------- escrita

  async criar(tenantId: string, dto: CriarCanalDto): Promise<{ id: string }> {
    const webhookSecret = randomBytes(32).toString('hex');

    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.create({
        data: {
          tenantId,
          label: dto.label.trim(),
          tipo: dto.tipo ?? 'whatsapp',
          metaPhoneNumberId: dto.metaPhoneNumberId?.trim() ?? null,
          metaWabaId: dto.metaWabaId?.trim() ?? null,
          metaTokenCifrado: cifrar(dto.metaToken),
          metaAppSecretCifrado: dto.metaAppSecret ? cifrar(dto.metaAppSecret) : null,
          metaVerifyToken: dto.metaVerifyToken?.trim() ?? null,
          webhookSecret,
          secretariaId: dto.secretariaId ?? null,
          ativo: dto.ativo ?? true,
          ordem: dto.ordem ?? 0,
        } as any,
      }),
    );

    return { id: row.id };
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarCanalDto): Promise<void> {
    // Verifica existência (RLS garante escopo de tenant)
    const atual = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({ where: { id } }),
    );
    if (!atual) throw new NotFoundException(`Canal ${id} não encontrado.`);

    const data: Record<string, unknown> = {};

    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.metaPhoneNumberId !== undefined) data.metaPhoneNumberId = dto.metaPhoneNumberId.trim();
    if (dto.metaWabaId !== undefined) data.metaWabaId = dto.metaWabaId?.trim() ?? null;
    if (dto.metaVerifyToken !== undefined) data.metaVerifyToken = dto.metaVerifyToken?.trim() ?? null;
    if (dto.secretariaId !== undefined) data.secretariaId = dto.secretariaId ?? null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;

    // Segredos: só atualiza quando novo valor enviado
    if (dto.metaToken) data.metaTokenCifrado = cifrar(dto.metaToken);
    if (dto.metaAppSecret) data.metaAppSecretCifrado = cifrar(dto.metaAppSecret);

    await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.update({
        where: { id },
        data: data as any,
      }),
    );
  }

  async excluir(tenantId: string, id: string): Promise<void> {
    const atual = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({ where: { id } }),
    );
    if (!atual) throw new NotFoundException(`Canal ${id} não encontrado.`);

    await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.delete({ where: { id } }),
    );
  }

  // ---------------------------------------------------------------- uso interno (decifrado)

  /**
   * Retorna credenciais decifradas para uso no WhatsappService.enviarPorCanal.
   * Nunca exposto pela API — uso estritamente interno.
   */
  async configDoCanal(canalId: string, tenantId: string): Promise<CanalDecifrado> {
    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({ where: { id: canalId } }),
    );
    if (!row) throw new NotFoundException(`Canal ${canalId} não encontrado.`);
    return this.decifrarRow(row);
  }

  /**
   * Resolve canal por webhook_secret (cross-tenant).
   * Justificativa: o webhook chega sem TenantContext; precisamos localizar
   * o canal (e consequentemente o tenant) para validar assinatura e processar.
   *
   * ÚNICO ponto cross-tenant deste service — uso exclusivo pelo webhook controller.
   */
  async canalPorWebhookSecret(secret: string): Promise<CanalDecifrado | null> {
    const row = await this.prisma
      .platform()
      .tenantWhatsappCanal.findFirst({
        where: { webhookSecret: secret, ativo: true },
      });
    if (!row) return null;
    return this.decifrarRow(row);
  }

  // ---------------------------------------------------------------- webhook-info / telegram-setwebhook (usados pelo admin e pelo platform controller)

  /**
   * Retorna os dados necessários para configurar o webhook do canal no provedor
   * (Meta ou Telegram). Nunca expõe segredos em claro.
   *
   * Para Telegram: callbackUrl = PUBLIC_API/webhooks/telegram/:webhookSecret
   * Para Meta (WA/IG/Messenger): callbackUrl = PUBLIC_API/webhooks/meta-canal/:webhookSecret
   */
  async webhookInfo(
    tenantId: string,
    canalId: string,
  ): Promise<{
    tipo: string;
    callbackUrl: string | null;
    verifyTokenDefinido: boolean;
    appSecretDefinido: boolean;
    phoneNumberIdDefinido: boolean;
    webhookSecretDefinido: boolean;
    pronto: boolean;
    aviso: string;
  }> {
    const canal = await this.buscarPorId(tenantId, canalId);

    const publicApi = process.env.PUBLIC_API ?? '';
    const raw = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({
        where: { id: canalId },
        select: { webhookSecret: true },
      }),
    );

    const tipo = (canal as { tipo?: string }).tipo ?? 'whatsapp';

    if (tipo === 'telegram') {
      const temToken = canal.metaTokenDefinido;
      const temSecret = !!raw?.webhookSecret;
      const pronto = !!(temToken && temSecret && publicApi);
      const callbackUrl = pronto
        ? `${publicApi}/webhooks/telegram/${raw!.webhookSecret}`
        : null;
      return {
        tipo,
        callbackUrl,
        verifyTokenDefinido: canal.metaVerifyTokenDefinido,
        appSecretDefinido: false,
        phoneNumberIdDefinido: false,
        webhookSecretDefinido: temSecret,
        pronto,
        aviso: pronto
          ? 'Use o botão "Configurar webhook automaticamente" para registrar esta URL no Telegram, ou chame manualmente: POST https://api.telegram.org/bot<TOKEN>/setWebhook.'
          : 'Defina o Token do Bot (BotFather) e salve — a URL do webhook é gerada automaticamente.',
      };
    }

    // WhatsApp / Instagram / Messenger (Meta Cloud API)
    const temSecret = !!raw?.webhookSecret;
    const pronto = !!(temSecret && canal.metaPhoneNumberId && publicApi);
    const callbackUrl = pronto
      ? `${publicApi}/webhooks/meta-canal/${raw!.webhookSecret}`
      : null;

    const avisoMeta: Record<string, string> = {
      whatsapp:
        'Cole a Callback URL e o Verify Token no app da Meta (Webhooks → whatsapp_business_account) e assine o campo "messages".',
      instagram:
        'Cole a Callback URL e o Verify Token no painel da Meta → Instagram → Webhooks e assine o campo "messages".',
      messenger:
        'Cole a Callback URL e o Verify Token no painel da Meta → Messenger → Configurações → Webhooks e assine o campo "messages".',
    };
    const avisoIncompleto =
      'Defina phone_number_id (ou Page ID), token, app secret e verify token — o webhook secret é gerado automaticamente.';

    return {
      tipo,
      callbackUrl,
      verifyTokenDefinido: canal.metaVerifyTokenDefinido,
      appSecretDefinido: canal.metaAppSecretDefinido,
      phoneNumberIdDefinido: !!canal.metaPhoneNumberId,
      webhookSecretDefinido: temSecret,
      pronto,
      aviso: pronto ? (avisoMeta[tipo] ?? avisoMeta.whatsapp) : avisoIncompleto,
    };
  }

  /**
   * Registra automaticamente o webhook no Telegram via Bot API.
   * O BotToken é decifrado internamente e jamais retornado ao cliente.
   *
   * Corpo enviado à Bot API:
   *   { url, secret_token (= metaVerifyToken, opcional), allowed_updates: ['message'] }
   */
  async telegramSetWebhook(
    tenantId: string,
    canalId: string,
  ): Promise<{ ok: boolean; descricao: string }> {
    const canal = await this.buscarPorId(tenantId, canalId);
    const tipo = (canal as { tipo?: string }).tipo ?? 'whatsapp';

    if (tipo !== 'telegram') {
      throw new BadRequestException('Este canal não é do tipo Telegram.');
    }
    if (!canal.metaTokenDefinido) {
      throw new BadRequestException('Token do Bot não definido. Salve o canal com o token primeiro.');
    }

    const publicApi = process.env.PUBLIC_API;
    if (!publicApi) {
      throw new BadRequestException('PUBLIC_API não configurada no servidor.');
    }

    // Obtém BotToken decifrado — uso interno; nunca retornado ao cliente
    const canalDecifrado = await this.configDoCanal(canalId, tenantId);
    if (!canalDecifrado.metaToken) {
      throw new BadRequestException('Falha ao decifrar o token do bot.');
    }

    const raw = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCanal.findFirst({
        where: { id: canalId },
        select: { webhookSecret: true, metaVerifyToken: true },
      }),
    );
    if (!raw?.webhookSecret) {
      throw new BadRequestException('Webhook secret não gerado. Salve o canal primeiro.');
    }

    const webhookUrl = `${publicApi}/webhooks/telegram/${raw.webhookSecret}`;

    const tgBody: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ['message'],
    };
    if (raw.metaVerifyToken) {
      tgBody['secret_token'] = raw.metaVerifyToken;
    }

    try {
      const resp = await firstValueFrom(
        this.http.post(
          `https://api.telegram.org/bot${canalDecifrado.metaToken}/setWebhook`,
          tgBody,
          { timeout: 10000 },
        ),
      );
      const tgResult = resp.data as { ok: boolean; description?: string; error_code?: number };
      return {
        ok: tgResult.ok,
        descricao:
          tgResult.description ??
          (tgResult.ok ? 'Webhook registrado com sucesso.' : 'Falha ao registrar webhook.'),
      };
    } catch (e) {
      const msg = (e as Error).message ?? 'Erro ao chamar a Bot API do Telegram.';
      this.log.warn(`Telegram setWebhook [canal ${canalId}]: ${msg}`);
      return { ok: false, descricao: msg };
    }
  }

  // ---------------------------------------------------------------- helpers

  private mascarar(row: {
    id: string;
    tenantId: string;
    label: string;
    provider: string;
    tipo?: string;
    metaPhoneNumberId: string | null;
    metaWabaId?: string | null;
    metaTokenCifrado?: string | null;
    metaAppSecretCifrado?: string | null;
    metaVerifyToken?: string | null;
    webhookSecret: string;
    secretariaId?: string | null;
    ativo: boolean;
    ordem: number;
    atualizadoEm: Date;
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      label: row.label,
      provider: row.provider,
      tipo: row.tipo ?? 'whatsapp',
      metaPhoneNumberId: row.metaPhoneNumberId,
      metaWabaId: row.metaWabaId ?? null,
      metaTokenDefinido: !!row.metaTokenCifrado,
      metaAppSecretDefinido: !!row.metaAppSecretCifrado,
      metaVerifyTokenDefinido: !!row.metaVerifyToken,
      webhookSecretDefinido: !!row.webhookSecret,
      secretariaId: row.secretariaId ?? null,
      ativo: row.ativo,
      ordem: row.ordem,
      atualizadoEm: row.atualizadoEm,
    };
  }

  private decifrarRow(row: {
    id: string;
    tenantId: string;
    label: string;
    provider: string;
    tipo?: string;
    metaPhoneNumberId: string | null;
    metaWabaId?: string | null;
    metaTokenCifrado?: string | null;
    metaAppSecretCifrado?: string | null;
    metaVerifyToken?: string | null;
    webhookSecret: string;
    secretariaId?: string | null;
    ativo: boolean;
    ordem: number;
    atualizadoEm: Date;
  }): CanalDecifrado {
    return {
      id: row.id,
      tenantId: row.tenantId,
      label: row.label,
      provider: row.provider,
      tipo: row.tipo ?? 'whatsapp',
      metaPhoneNumberId: row.metaPhoneNumberId,
      metaWabaId: row.metaWabaId,
      metaToken: row.metaTokenCifrado ? this.decifrarSafe(row.metaTokenCifrado) : null,
      metaAppSecret: row.metaAppSecretCifrado ? this.decifrarSafe(row.metaAppSecretCifrado) : null,
      metaVerifyToken: row.metaVerifyToken,
      webhookSecret: row.webhookSecret,
      secretariaId: row.secretariaId,
      ativo: row.ativo,
      ordem: row.ordem,
      atualizadoEm: row.atualizadoEm,
    };
  }

  private decifrarSafe(blob: string): string | null {
    try {
      return decifrar(blob);
    } catch (e) {
      this.log.warn(`Falha ao decifrar segredo de canal WhatsApp: ${(e as Error).message}`);
      return null;
    }
  }
}
