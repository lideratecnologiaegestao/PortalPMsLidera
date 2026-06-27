import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisCommands } from '../queue/redis.config';
import { ButtonsInput, ListInput, MediaInput, SendResult, TemplateInput, WhatsappProvider } from './whatsapp-provider.interface';
import { WhatsappConfigService, TenantWhatsappConfigDecifrada } from './whatsapp-config.service';
import { WhatsappCanaisService } from './whatsapp-canais.service';
import { EvolutionProvider } from './evolution.provider';
import { ZApiProvider } from './zapi.provider';
import { MetaCloudProvider } from './meta-cloud.provider';
import { InstagramProvider } from './instagram.provider';
import { MessengerProvider } from './messenger.provider';
import { TelegramProvider } from './telegram.provider';

// ---------------------------------------------------------------- Circuit Breaker
const CB_FALHAS_LIMITE = 5;      // falhas para abrir o breaker
const CB_JANELA_SEGUNDOS = 120;  // janela de contagem (2 min)
const CB_ABERTO_SEGUNDOS = 60;   // tempo que o breaker fica aberto (1 min)

function cbKey(tenantId: string, provider: string) {
  return `wa:cb:${tenantId}:${provider}`;
}

function cbAbertoKey(tenantId: string, provider: string) {
  return `wa:cb:${tenantId}:${provider}:aberto`;
}

async function brekerAberto(tenantId: string, provider: string): Promise<boolean> {
  const v = await redisCommands.get(cbAbertoKey(tenantId, provider));
  return v === '1';
}

async function registrarFalha(tenantId: string, provider: string): Promise<void> {
  const key = cbKey(tenantId, provider);
  const akey = cbAbertoKey(tenantId, provider);
  const falhas = await redisCommands.incr(key);
  await redisCommands.expire(key, CB_JANELA_SEGUNDOS);
  if (falhas >= CB_FALHAS_LIMITE) {
    await redisCommands.set(akey, '1', 'EX', CB_ABERTO_SEGUNDOS);
  }
}

async function registrarSucesso(tenantId: string, provider: string): Promise<void> {
  await redisCommands.del(cbKey(tenantId, provider));
  await redisCommands.del(cbAbertoKey(tenantId, provider));
}

// ---------------------------------------------------------------- Factory cache
interface CacheEntry {
  provider: WhatsappProvider;
  assinatura: string;
}

function assinatura(cfg: TenantWhatsappConfigDecifrada, nome: string): string {
  if (nome === 'zapi') return `${cfg.zapiInstanceId}|${cfg.zapiToken}|${cfg.zapiClientToken}`;
  if (nome === 'evolution') return `${cfg.evolutionApiUrl}|${cfg.evolutionInstance}`;
  if (nome === 'meta') return `${cfg.metaPhoneNumberId}|${cfg.metaToken}`;
  return nome;
}

/**
 * Adapter público de WhatsApp (multi-tenant, resiliente).
 *
 * Resolve o provider do tenant via factory, envia com:
 *  - retry interno (2 tentativas com backoff)
 *  - circuit breaker por tenant+provider (Redis)
 *  - fallback para o provider secundário se configurado
 *  - auditoria LGPD-safe (número mascarado, sem conteúdo)
 *
 * Método `enviar(numero, texto)` é retrocompatível com o antigo
 * WhatsappService de notificacoes/.
 *
 * NUNCA logar token/clientToken/conteúdo da mensagem.
 */
@Injectable()
export class WhatsappService {
  private readonly log = new Logger(WhatsappService.name);
  /** Cache de providers por (tenant, assinatura de config) — evita recriar a cada envio. */
  private readonly providerCache = new Map<string, CacheEntry>();

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly configService: WhatsappConfigService,
    private readonly canaisService: WhatsappCanaisService,
  ) {}

  // ---------------------------------------------------------------- API pública

  /**
   * Retrocompatível: retorna true se o provider global está minimamente configurado.
   * Usado por ContatosService.obter() para indicar ao frontend se o canal está disponível.
   */
  get habilitado(): boolean {
    const provider = process.env.WHATSAPP_PROVIDER ?? 'evolution';
    if (provider === 'zapi') {
      // Client-Token é opcional (só exigido se a conta Z-API tem segurança ligada).
      return !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN);
    }
    if (provider === 'meta') {
      return !!(process.env.META_PHONE_NUMBER_ID && process.env.META_TOKEN);
    }
    return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
  }

  /**
   * Retrocompatível com o caller antigo: enviar(numero, texto).
   * Resolve tenantId do TenantContext.
   */
  async enviar(numero: string, texto: string): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar WhatsApp.');
    const r = await this.enviarComResiliencia(tenantId, (p) => p.sendText(numero, texto), numero);
    return { id: r.id };
  }

  async enviarMidia(
    numero: string,
    media: MediaInput,
    caption?: string,
  ): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar mídia WhatsApp.');
    const r = await this.enviarComResiliencia(
      tenantId,
      (p) => p.sendMedia(numero, media, caption),
      numero,
    );
    return { id: r.id };
  }

  async enviarBotoes(
    numero: string,
    payload: ButtonsInput,
  ): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar botões WhatsApp.');
    const r = await this.enviarComResiliencia(
      tenantId,
      (p) => (p.sendButtons ? p.sendButtons(numero, payload) : p.sendText(numero, payload.message)),
      numero,
    );
    return { id: r.id };
  }

  /**
   * Envia lista interativa (4–10 opções) via provider do tenant.
   * Fallback automático para texto numerado quando o provider não implementa sendList.
   */
  async enviarLista(
    numero: string,
    payload: ListInput,
  ): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar lista WhatsApp.');
    const textoFallback = `${payload.message}\n\n${payload.rows.map((r, i) => `${i + 1}. ${r.label}`).join('\n')}`;
    const r = await this.enviarComResiliencia(
      tenantId,
      (p) => (p.sendList ? p.sendList(numero, payload) : p.sendText(numero, textoFallback)),
      numero,
    );
    return { id: r.id };
  }

  /**
   * Envia um template aprovado (HSM) — necessário para INICIAR conversa fora da
   * janela de 24h via API Oficial da Meta. Providers sem suporte a template
   * (Z-API/Evolution) degradam: enviam o `textoFallback` como mensagem comum.
   * Best-effort: após o envio, insere linha em whatsapp_template_envios para controle de cota.
   */
  async enviarTemplate(
    numero: string,
    template: TemplateInput,
    textoFallback?: string,
  ): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar template WhatsApp.');
    let status = 'enviado';
    let r: SendResult = { ok: false };
    try {
      r = await this.enviarComResiliencia(
        tenantId,
        (p) =>
          p.sendTemplate
            ? p.sendTemplate(numero, template)
            : p.sendText(numero, textoFallback ?? `(${template.nome})`),
        numero,
      );
    } catch (e) {
      status = 'falhou';
      throw e;
    } finally {
      this.registrarEnvioTemplate(tenantId, null, template.nome, numero, status).catch(() => undefined);
    }
    return { id: r.id };
  }

  /**
   * Retorna o provider ativo do tenant (para status/provisioning no admin).
   */
  async providerDoTenant(tenantId: string): Promise<WhatsappProvider> {
    const cfg = await this.configService.configDoTenant(tenantId);
    return this.resolverProvider(cfg, cfg.provider);
  }

  // ---------------------------------------------------------------- API por canal (multi-número Meta)

  /**
   * Envia texto por um canal Meta específico (multi-número).
   * As credenciais são lidas do canal (decifradas) via WhatsappCanaisService.
   * Circuit breaker é keyed por canalId (independente dos providers de tenant).
   * LGPD-safe: número mascarado na auditoria.
   */
  async enviarPorCanal(
    canalId: string,
    numero: string,
    texto: string,
  ): Promise<{ id?: string }> {
    const r = await this.enviarPorCanalComResiliencia(
      canalId,
      (p) => p.sendText(numero, texto),
      numero,
    );
    return { id: r.id };
  }

  async enviarMidiaPorCanal(
    canalId: string,
    numero: string,
    media: MediaInput,
    caption?: string,
  ): Promise<{ id?: string }> {
    const r = await this.enviarPorCanalComResiliencia(
      canalId,
      (p) => p.sendMedia(numero, media, caption),
      numero,
    );
    return { id: r.id };
  }

  /**
   * Envia botões de resposta rápida (≤3) por um canal específico (multi-número Meta).
   * Fallback para texto quando o provider não implementa sendButtons.
   */
  async enviarBotoesPorCanal(
    canalId: string,
    numero: string,
    payload: ButtonsInput,
  ): Promise<{ id?: string }> {
    const r = await this.enviarPorCanalComResiliencia(
      canalId,
      (p) => (p.sendButtons ? p.sendButtons(numero, payload) : p.sendText(numero, payload.message)),
      numero,
    );
    return { id: r.id };
  }

  /**
   * Envia lista interativa (4–10 opções) por um canal específico (multi-número Meta).
   * Fallback para texto numerado quando o provider não implementa sendList.
   */
  async enviarListaPorCanal(
    canalId: string,
    numero: string,
    payload: ListInput,
  ): Promise<{ id?: string }> {
    const textoFallback = `${payload.message}\n\n${payload.rows.map((r, i) => `${i + 1}. ${r.label}`).join('\n')}`;
    const res = await this.enviarPorCanalComResiliencia(
      canalId,
      (p) => (p.sendList ? p.sendList(numero, payload) : p.sendText(numero, textoFallback)),
      numero,
    );
    return { id: res.id };
  }

  async enviarTemplatePorCanal(
    canalId: string,
    numero: string,
    template: TemplateInput,
    textoFallback?: string,
  ): Promise<{ id?: string }> {
    const tenantId = TenantContext.tenantId();
    let status = 'enviado';
    let r: SendResult = { ok: false };
    try {
      r = await this.enviarPorCanalComResiliencia(
        canalId,
        (p) =>
          p.sendTemplate
            ? p.sendTemplate(numero, template)
            : p.sendText(numero, textoFallback ?? `(${template.nome})`),
        numero,
      );
    } catch (e) {
      status = 'falhou';
      throw e;
    } finally {
      if (tenantId) {
        this.registrarEnvioTemplate(tenantId, canalId, template.nome, numero, status).catch(() => undefined);
      }
    }
    return { id: r.id };
  }

  // ---------------------------------------------------------------- Resiliência por canal

  private async enviarPorCanalComResiliencia(
    canalId: string,
    operacao: (p: WhatsappProvider) => Promise<SendResult>,
    numeroParaAudit: string,
  ): Promise<SendResult> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('TenantContext ausente ao enviar por canal.');

    const canal = await this.canaisService.configDoCanal(canalId, tenantId);
    if (!canal.metaToken) {
      throw new Error(`Canal ${canalId} (${canal.label}) sem token configurado.`);
    }
    // Tipo do canal para roteamento correto
    const tipoCanalRaw = canal.tipo ?? 'whatsapp';

    // Telegram não usa metaPhoneNumberId para envio — só metaToken é obrigatório.
    if (tipoCanalRaw !== 'telegram' && !canal.metaPhoneNumberId) {
      throw new Error(`Canal ${canalId} (${canal.label}) sem metaPhoneNumberId configurado.`);
    }

    // Circuit breaker keyed por canalId (independente do provider de tenant)
    const cbKey = `canal:${canalId}`;
    const aberto = await brekerAberto(tenantId, cbKey);

    if (!aberto) {
      const provider = this.resolverProviderCanal(canalId, canal, tipoCanalRaw);
      let resultado: SendResult = { ok: false, erro: 'não tentado' };

      for (let i = 0; i < 2; i++) {
        try {
          resultado = await operacao(provider);
          if (resultado.ok) break;
        } catch (e) {
          resultado = { ok: false, erro: (e as Error).message };
        }
        if (i === 0) await new Promise((r) => setTimeout(r, 800));
      }

      if (resultado.ok) {
        await registrarSucesso(tenantId, cbKey);
        await this.auditarCanal(tenantId, canalId, canal.label, numeroParaAudit, 'WHATSAPP_CANAL_ENVIADO');
        return resultado;
      }

      await registrarFalha(tenantId, cbKey);
      this.log.warn(`Canal ${canalId} (${canal.label}) falhou: ${resultado.erro}`);
      await this.auditarCanal(tenantId, canalId, canal.label, numeroParaAudit, 'WHATSAPP_CANAL_FALHA');
      throw new Error(`Falha ao enviar pelo canal ${canal.label}: ${resultado.erro}`);
    }

    this.log.warn(`Circuit breaker ABERTO para canal ${canalId} (${canal.label}).`);
    throw new Error(`Canal ${canal.label} temporariamente indisponível (circuit breaker).`);
  }

  private resolverProviderCanal(
    canalId: string,
    canal: { metaPhoneNumberId: string | null; metaToken?: string | null },
    tipo = 'whatsapp',
  ): WhatsappProvider {
    const cacheKey = `canal:${canalId}`;
    const sig = `${tipo}|${canal.metaPhoneNumberId}|${canal.metaToken}`;
    const cached = this.providerCache.get(cacheKey);
    if (cached && cached.assinatura === sig) return cached.provider;

    if (!canal.metaToken) throw new Error(`Canal ${canalId}: token não configurado.`);

    let provider: WhatsappProvider;

    if (tipo === 'instagram') {
      // metaPhoneNumberId é garantido não-nulo para Instagram pelo check anterior
      provider = new InstagramProvider(this.http, {
        pageOrIgId: canal.metaPhoneNumberId!,
        token: canal.metaToken,
        apiVersion: process.env.META_API_VERSION,
      });
    } else if (tipo === 'messenger') {
      // metaPhoneNumberId é garantido não-nulo para Messenger pelo check anterior
      provider = new MessengerProvider(this.http, {
        pageId: canal.metaPhoneNumberId!,
        token: canal.metaToken,
        apiVersion: process.env.META_API_VERSION,
      });
    } else if (tipo === 'telegram') {
      // Telegram usa apenas o token do bot (não usa metaPhoneNumberId)
      provider = new TelegramProvider(this.http, {
        token: canal.metaToken,
      });
    } else {
      // 'whatsapp' e qualquer tipo desconhecido → Cloud API padrão
      // metaPhoneNumberId é garantido não-nulo para WhatsApp pelo check anterior
      provider = new MetaCloudProvider(this.http, {
        phoneNumberId: canal.metaPhoneNumberId!,
        token: canal.metaToken,
        apiVersion: process.env.META_API_VERSION,
      });
    }

    this.providerCache.set(cacheKey, { provider, assinatura: sig });
    return provider;
  }

  // ---------------------------------------------------------------- Log de envio de template (cota)

  /**
   * Insere linha best-effort em whatsapp_template_envios para controle de cota.
   * Nunca derruba o envio principal — erros são silenciados.
   */
  private async registrarEnvioTemplate(
    tenantId: string,
    canalId: string | null,
    templateNome: string,
    numero: string,
    status: string,
  ): Promise<void> {
    const toMascarado = `••••${numero.replace(/\D/g, '').slice(-4)}`;
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.whatsappTemplateEnvio.create({
          data: {
            tenantId,
            canalId: canalId ?? null,
            templateNome,
            toMascarado,
            status,
          } as any,
        }),
      );
    } catch (e) {
      this.log.warn(`Falha ao registrar envio de template (best-effort): ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- Auditoria LGPD-safe (por canal)

  private async auditarCanal(
    tenantId: string,
    canalId: string,
    canalLabel: string,
    numero: string,
    acao: string,
  ): Promise<void> {
    const toMascarado = `••••${numero.replace(/\D/g, '').slice(-4)}`;
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao,
            entidade: 'whatsapp_canal',
            entidadeId: canalId,
            dados: { canalLabel, to_mascarado: toMascarado } as object,
          } as any,
        }),
      );
    } catch (e) {
      this.log.warn(`Falha ao auditar envio por canal: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- Resiliência

  private async enviarComResiliencia(
    tenantId: string,
    operacao: (p: WhatsappProvider) => Promise<SendResult>,
    numeroParaAudit: string,
  ): Promise<SendResult> {
    const cfg = await this.configService.configDoTenant(tenantId);
    const providerNome = cfg.provider;

    // Tenta provider primário (com retry + circuit breaker)
    const aberto = await brekerAberto(tenantId, providerNome);
    if (!aberto) {
      const resultado = await this.tentarComRetry(tenantId, providerNome, cfg, operacao, 2);
      if (resultado.ok) {
        await registrarSucesso(tenantId, providerNome);
        await this.auditar(tenantId, providerNome, numeroParaAudit, 'WHATSAPP_ENVIADO');
        return resultado;
      }
      await registrarFalha(tenantId, providerNome);
      this.log.warn(`WhatsApp provider '${providerNome}' falhou para tenant ${tenantId}: ${resultado.erro}`);
    } else {
      this.log.warn(`Circuit breaker ABERTO para tenant ${tenantId} provider ${providerNome}. Tentando fallback.`);
    }

    // Tenta fallback se configurado
    if (cfg.fallbackProvider && cfg.fallbackProvider !== providerNome) {
      const fbNome = cfg.fallbackProvider;
      const fbAberto = await brekerAberto(tenantId, fbNome);
      if (!fbAberto) {
        const fbResult = await this.tentarComRetry(tenantId, fbNome, cfg, operacao, 1);
        if (fbResult.ok) {
          await registrarSucesso(tenantId, fbNome);
          await this.auditar(tenantId, `${providerNome}→${fbNome}(fallback)`, numeroParaAudit, 'WHATSAPP_ENVIADO');
          return fbResult;
        }
        await registrarFalha(tenantId, fbNome);
        this.log.error(`Fallback WhatsApp '${fbNome}' também falhou para tenant ${tenantId}: ${fbResult.erro}`);
      }
    }

    // Ambos falharam — registra falha em audit e lança
    await this.auditar(tenantId, providerNome, numeroParaAudit, 'WHATSAPP_FALHA');
    throw new Error(`Falha ao enviar WhatsApp — providers ${providerNome}${cfg.fallbackProvider ? ' e ' + cfg.fallbackProvider : ''} indisponíveis.`);
  }

  private async tentarComRetry(
    _tenantId: string,
    providerNome: string,
    cfg: TenantWhatsappConfigDecifrada,
    operacao: (p: WhatsappProvider) => Promise<SendResult>,
    tentativas: number,
  ): Promise<SendResult> {
    const provider = this.resolverProvider(cfg, providerNome as any);
    let resultado: SendResult = { ok: false, erro: 'não tentado' };

    for (let i = 0; i < tentativas; i++) {
      try {
        resultado = await operacao(provider);
        if (resultado.ok) return resultado;
      } catch (e) {
        resultado = { ok: false, erro: (e as Error).message };
      }
      if (i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1))); // backoff curto
      }
    }
    return resultado;
  }

  private resolverProvider(cfg: TenantWhatsappConfigDecifrada, nome: string): WhatsappProvider {
    const cacheKey = `${cfg.tenantId}:${nome}`;
    const sig = assinatura(cfg, nome);
    const cached = this.providerCache.get(cacheKey);
    if (cached && cached.assinatura === sig) return cached.provider;

    let provider: WhatsappProvider;

    if (nome === 'zapi') {
      // clientToken é OPCIONAL na Z-API (só exigido se a conta tem "segurança da conta" ligada).
      if (!cfg.zapiInstanceId || !cfg.zapiToken) {
        throw new Error(`Z-API não configurada para o tenant ${cfg.tenantId}.`);
      }
      provider = new ZApiProvider(this.http, {
        baseUrl: cfg.zapiBaseUrl ?? 'https://api.z-api.io/instances',
        instanceId: cfg.zapiInstanceId,
        token: cfg.zapiToken,
        clientToken: cfg.zapiClientToken ?? '',
      });
    } else if (nome === 'evolution') {
      if (!cfg.evolutionApiUrl || !cfg.evolutionInstance || !cfg.evolutionApiKey) {
        throw new Error(`Evolution API não configurada para o tenant ${cfg.tenantId}.`);
      }
      provider = new EvolutionProvider(this.http, {
        apiUrl: cfg.evolutionApiUrl,
        instance: cfg.evolutionInstance,
        apiKey: cfg.evolutionApiKey,
      });
    } else if (nome === 'meta') {
      if (!cfg.metaPhoneNumberId || !cfg.metaToken) {
        throw new Error(`Meta Cloud API não configurada para o tenant ${cfg.tenantId}.`);
      }
      provider = new MetaCloudProvider(this.http, {
        phoneNumberId: cfg.metaPhoneNumberId,
        token: cfg.metaToken,
        apiVersion: process.env.META_API_VERSION,
      });
    } else {
      throw new Error(`Provider desconhecido: ${nome}`);
    }

    this.providerCache.set(cacheKey, { provider, assinatura: sig });
    return provider;
  }

  // ---------------------------------------------------------------- Auditoria LGPD-safe

  private async auditar(
    tenantId: string,
    provider: string,
    numero: string,
    acao: string,
  ): Promise<void> {
    const toMascarado = `••••${numero.replace(/\D/g, '').slice(-4)}`;
    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            acao,
            entidade: 'whatsapp',
            entidadeId: null,
            dados: { provider, to_mascarado: toMascarado } as object,
          } as any,
        }),
      );
    } catch (e) {
      // best-effort — não falhar o envio por causa da auditoria
      this.log.warn(`Falha ao auditar WhatsApp: ${(e as Error).message}`);
    }
  }
}
