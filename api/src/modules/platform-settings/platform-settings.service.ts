import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { cifrar, decifrar } from '../../common/crypto/secret-box.util';
import { LGPD_TEMPLATE_PADRAO } from '../lgpd/doc/lgpd-template.const';

/** DTO de gravação da config global. undefined mantém; '' limpa (strings/segredo). */
export interface SalvarPlatformDto {
  devAtivo?: boolean;
  devNome?: string; devRazaoSocial?: string; devCnpj?: string; devEndereco?: string;
  devEmail?: string; devSuporteUrl?: string; devWhatsapp?: string; devSiteUrl?: string; devLogoUrl?: string;
  smtpAtivo?: boolean; smtpHost?: string; smtpPort?: number; smtpSecure?: boolean;
  smtpUser?: string; smtpPass?: string; smtpFrom?: string;
  backup?: Record<string, unknown>;
  // IA global (defaults; override por entidade continua tendo prioridade)
  iaModel?: string; embeddingsProvider?: string; embeddingsModel?: string;
  anthropicKey?: string; voyageKey?: string; openaiKey?: string;
}

/** IA global decifrada (defaults da plataforma; null = cair no .env). */
export interface IaGlobal {
  iaModel: string | null;
  embeddingsProvider: string | null;
  embeddingsModel: string | null;
  anthropicKey: string | null;
  voyageKey: string | null;
  openaiKey: string | null;
}

export interface SmtpGlobal {
  ativo: boolean; host?: string; port?: number; secure: boolean;
  user?: string; pass?: string; from?: string;
}

/**
 * Configuração GLOBAL da plataforma (linha única id=1). Sem RLS — acesso só pelo
 * super_admin via prisma.platform(). Segredos cifrados (secret-box). Cache curto
 * em memória (lido em hot paths: rodapé público e fallback de SMTP).
 */
@Injectable()
export class PlatformSettingsService {
  private readonly log = new Logger(PlatformSettingsService.name);
  private cache: { val: PlatformRow | null; exp: number } | null = null;
  private readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private invalidar() { this.cache = null; }

  /** Linha singleton (cacheada). Cria com defaults se não existir. */
  async get(): Promise<PlatformRow> {
    if (this.cache && this.cache.exp > Date.now() && this.cache.val) return this.cache.val;
    let row = (await this.prisma.platform().platformSettings.findUnique({ where: { id: 1 } })) as PlatformRow | null;
    if (!row) {
      row = (await this.prisma.platform().platformSettings.create({ data: { id: 1 } })) as PlatformRow;
    }
    this.cache = { val: row, exp: Date.now() + this.TTL_MS };
    return row;
  }

  /** Branding PÚBLICO ("Desenvolvido por") — sem segredo; usado no rodapé. */
  async brandingPublico() {
    const r = await this.get();
    return {
      ativo: r.devAtivo,
      nome: r.devNome ?? null,
      razaoSocial: r.devRazaoSocial ?? null,
      cnpj: r.devCnpj ?? null,
      endereco: r.devEndereco ?? null,
      email: r.devEmail ?? null,
      suporteUrl: r.devSuporteUrl ?? null,
      whatsapp: r.devWhatsapp ?? null,
      siteUrl: r.devSiteUrl ?? null,
      logoUrl: r.devLogoUrl ?? null,
    };
  }

  /** Config mascarada para o painel super_admin (sem segredo em claro). */
  async mascarada() {
    const r = await this.get();
    return {
      dev: {
        ativo: r.devAtivo, nome: r.devNome, razaoSocial: r.devRazaoSocial, cnpj: r.devCnpj,
        endereco: r.devEndereco, email: r.devEmail, suporteUrl: r.devSuporteUrl,
        whatsapp: r.devWhatsapp, siteUrl: r.devSiteUrl, logoUrl: r.devLogoUrl,
      },
      smtp: {
        ativo: r.smtpAtivo, host: r.smtpHost, port: r.smtpPort, secure: r.smtpSecure,
        user: r.smtpUser, from: r.smtpFrom, senhaDefinida: !!r.smtpPassCifrado,
      },
      ia: this.iaMascarada(r),
      backup: this.backupMascarado(r.backup),
      atualizadoEm: r.atualizadoEm,
    };
  }

  /** Remove segredo do backup (ftpPassCifrado) e expõe só a flag. */
  private backupMascarado(backup: unknown) {
    const b = { ...((backup as Record<string, unknown>) ?? {}) };
    const ftpSenhaDefinida = !!b.ftpPassCifrado;
    delete b.ftpPassCifrado;
    return { ...b, ftpSenhaDefinida };
  }

  /** Config de FTP decifrada (para o job de backup). */
  async ftpConfig(): Promise<{ ativo: boolean; host?: string; port?: number; user?: string; pass?: string; dir?: string; secure: boolean }> {
    const b = ((await this.get()).backup as Record<string, unknown>) ?? {};
    return {
      ativo: !!b.ftpAtivo && !!b.ftpHost,
      host: (b.ftpHost as string) ?? undefined,
      port: b.ftpPort ? Number(b.ftpPort) : undefined,
      user: (b.ftpUser as string) ?? undefined,
      pass: b.ftpPassCifrado ? (this.decifrarSafe(b.ftpPassCifrado as string) ?? undefined) : undefined,
      dir: (b.ftpDir as string) ?? undefined,
      secure: !!b.ftpSecure,
    };
  }

  /** IA global mascarada (chaves → booleans). */
  private iaMascarada(r: PlatformRow) {
    const ia = (((r.dados as Record<string, unknown>) ?? {}).ia as Record<string, unknown>) ?? {};
    return {
      iaModel: (ia.iaModel as string) ?? null,
      embeddingsProvider: (ia.embeddingsProvider as string) ?? null,
      embeddingsModel: (ia.embeddingsModel as string) ?? null,
      anthropicDefinida: !!ia.anthropicKeyCifrado,
      voyageDefinida: !!ia.voyageKeyCifrado,
      openaiDefinida: !!ia.openaiKeyCifrado,
    };
  }

  /** IA global decifrada (defaults da plataforma; null = cair no .env). */
  async iaGlobal(): Promise<IaGlobal> {
    const r = await this.get();
    const ia = (((r.dados as Record<string, unknown>) ?? {}).ia as Record<string, unknown>) ?? {};
    const dec = (b: unknown) => (b ? this.decifrarSafe(b as string) ?? null : null);
    return {
      iaModel: (ia.iaModel as string) ?? null,
      embeddingsProvider: (ia.embeddingsProvider as string) ?? null,
      embeddingsModel: (ia.embeddingsModel as string) ?? null,
      anthropicKey: dec(ia.anthropicKeyCifrado),
      voyageKey: dec(ia.voyageKeyCifrado),
      openaiKey: dec(ia.openaiKeyCifrado),
    };
  }

  /** SMTP global decifrado (fallback do EmailService). */
  async smtpGlobal(): Promise<SmtpGlobal> {
    const r = await this.get();
    return {
      ativo: r.smtpAtivo && !!r.smtpHost,
      host: r.smtpHost ?? undefined,
      port: r.smtpPort ?? undefined,
      secure: r.smtpSecure,
      user: r.smtpUser ?? undefined,
      pass: r.smtpPassCifrado ? this.decifrarSafe(r.smtpPassCifrado) : undefined,
      from: r.smtpFrom ?? undefined,
    };
  }

  /** Grava a config global (cifra senha SMTP; '' limpa; undefined mantém). */
  async salvar(dto: SalvarPlatformDto, atorId?: string) {
    const data: Record<string, unknown> = { atualizadoPor: atorId ?? null };

    const strFields: [keyof SalvarPlatformDto, string][] = [
      ['devNome', 'devNome'], ['devRazaoSocial', 'devRazaoSocial'], ['devCnpj', 'devCnpj'],
      ['devEndereco', 'devEndereco'], ['devEmail', 'devEmail'], ['devSuporteUrl', 'devSuporteUrl'],
      ['devWhatsapp', 'devWhatsapp'], ['devSiteUrl', 'devSiteUrl'], ['devLogoUrl', 'devLogoUrl'],
      ['smtpHost', 'smtpHost'], ['smtpUser', 'smtpUser'], ['smtpFrom', 'smtpFrom'],
    ];
    for (const [dk, col] of strFields) {
      const v = dto[dk] as string | undefined;
      if (v !== undefined) data[col] = v.trim() === '' ? null : v.trim();
    }
    if (dto.devAtivo !== undefined) data.devAtivo = dto.devAtivo;
    if (dto.smtpAtivo !== undefined) data.smtpAtivo = dto.smtpAtivo;
    if (dto.smtpSecure !== undefined) data.smtpSecure = dto.smtpSecure;
    if (dto.smtpPort !== undefined) data.smtpPort = dto.smtpPort === null ? null : Math.trunc(dto.smtpPort);
    if (dto.smtpPass !== undefined) data.smtpPassCifrado = dto.smtpPass.trim() === '' ? null : cifrar(dto.smtpPass.trim());
    // MERGE no jsonb backup (preserva status da última execução gravado pelo job).
    if (dto.backup !== undefined) {
      const atual = ((await this.get()).backup as Record<string, unknown>) ?? {};
      const novo = { ...atual, ...dto.backup } as Record<string, unknown>;
      // Senha FTP nunca em claro: cifra e remove o campo plano.
      if (typeof novo.ftpPass === 'string') {
        novo.ftpPassCifrado = novo.ftpPass.trim() === '' ? null : cifrar(novo.ftpPass.trim());
        delete novo.ftpPass;
      }
      data.backup = novo as object;
    }

    // IA global → dados.ia (chaves cifradas; '' limpa, undefined mantém).
    const iaPatch: Record<string, unknown> = {};
    if (dto.iaModel !== undefined) iaPatch.iaModel = dto.iaModel.trim() || null;
    if (dto.embeddingsProvider !== undefined) iaPatch.embeddingsProvider = dto.embeddingsProvider.trim() || null;
    if (dto.embeddingsModel !== undefined) iaPatch.embeddingsModel = dto.embeddingsModel.trim() || null;
    if (dto.anthropicKey !== undefined) iaPatch.anthropicKeyCifrado = dto.anthropicKey.trim() === '' ? null : cifrar(dto.anthropicKey.trim());
    if (dto.voyageKey !== undefined) iaPatch.voyageKeyCifrado = dto.voyageKey.trim() === '' ? null : cifrar(dto.voyageKey.trim());
    if (dto.openaiKey !== undefined) iaPatch.openaiKeyCifrado = dto.openaiKey.trim() === '' ? null : cifrar(dto.openaiKey.trim());
    if (Object.keys(iaPatch).length) {
      const atualDados = ((await this.get()).dados as Record<string, unknown>) ?? {};
      const atualIa = (atualDados.ia as Record<string, unknown>) ?? {};
      data.dados = { ...atualDados, ia: { ...atualIa, ...iaPatch } } as object;
    }

    await this.prisma.platform().platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    this.invalidar();
    return this.mascarada();
  }

  /** Identidade da OPERADORA (provedora) para a documentação LGPD das entidades. */
  async operadora(): Promise<{ nome: string; cnpj: string }> {
    const r = await this.get();
    return {
      nome: r.devRazaoSocial || r.devNome || 'Lidera Tecnologia e Gestão Ltda',
      cnpj: r.devCnpj || '23.969.313/0001-58',
    };
  }

  /** Template GLOBAL da documentação LGPD (default em código; override editável). */
  async getLgpdTemplate(): Promise<{ template: string; personalizado: boolean; atualizadoEm: string | null }> {
    const dados = ((await this.get()).dados as Record<string, unknown>) ?? {};
    const lgpd = (dados.lgpd as Record<string, unknown>) ?? {};
    const tpl = typeof lgpd.template === 'string' && lgpd.template.trim() !== '' ? (lgpd.template as string) : null;
    return {
      template: tpl ?? LGPD_TEMPLATE_PADRAO,
      personalizado: !!tpl,
      atualizadoEm: (lgpd.atualizadoEm as string) ?? null,
    };
  }

  /** Grava o template LGPD global (null/'' volta ao padrão de código). */
  async setLgpdTemplate(texto: string | null, atorId?: string): Promise<void> {
    const r = await this.get();
    const dados = ((r.dados as Record<string, unknown>) ?? {});
    const limpo = (texto ?? '').trim();
    const lgpd = limpo === ''
      ? {}
      : { template: limpo, atualizadoEm: new Date().toISOString(), atualizadoPor: atorId ?? null };
    await this.prisma.platform().platformSettings.update({
      where: { id: 1 },
      data: { dados: { ...dados, lgpd } as object },
    });
    this.invalidar();
  }

  /** Define a logomarca da empresa (chave no storage) e a URL pública estável. */
  async setLogo(key: string, mime: string): Promise<void> {
    const r = await this.get();
    const dados = { ...((r.dados as Record<string, unknown>) ?? {}), logoKey: key, logoMime: mime };
    await this.prisma.platform().platformSettings.update({
      where: { id: 1 },
      data: { dados: dados as object, devLogoUrl: '/api/branding/logo' },
    });
    this.invalidar();
  }

  /** Chave/mime da logomarca no storage (para servir o arquivo). */
  async getLogo(): Promise<{ key: string; mime: string } | null> {
    const dados = ((await this.get()).dados as Record<string, unknown>) ?? {};
    return dados.logoKey ? { key: dados.logoKey as string, mime: (dados.logoMime as string) ?? 'image/png' } : null;
  }

  /** Mescla campos no jsonb `backup` (ex.: status da última execução). */
  async mergeBackup(patch: Record<string, unknown>): Promise<void> {
    const r = await this.get();
    const atual = (r.backup as Record<string, unknown>) ?? {};
    await this.prisma.platform().platformSettings.update({
      where: { id: 1 },
      data: { backup: { ...atual, ...patch } as object },
    });
    this.invalidar();
  }

  private decifrarSafe(blob: string): string | undefined {
    try { return decifrar(blob); } catch (e) { this.log.warn(`Falha ao decifrar segredo global: ${(e as Error).message}`); return undefined; }
  }
}

interface PlatformRow {
  id: number; devAtivo: boolean; devNome: string | null; devRazaoSocial: string | null;
  devCnpj: string | null; devEndereco: string | null; devEmail: string | null; devSuporteUrl: string | null;
  devWhatsapp: string | null; devSiteUrl: string | null; devLogoUrl: string | null;
  smtpAtivo: boolean; smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean;
  smtpUser: string | null; smtpPassCifrado: string | null; smtpFrom: string | null;
  backup: unknown; dados: unknown; atualizadoEm: Date; atualizadoPor: string | null;
}
