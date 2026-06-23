import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { StorageService } from '../storage/storage.service';
import { AtualizarAppConfigDto, CAMPOS_SUPER_ADMIN } from './app-config.dto';
import { Role } from '../../common/rbac/roles.enum';

/** Mesmo TTL do tema (ADR-0001). */
const TTL_APP_CONFIG = 600; // segundos

/** Dimensões exigidas para o ícone do app (quadrado). */
const ICON_TAMANHO = 1024;

/** Prefixo no bucket para assets do app do cidadão. */
const STORAGE_PREFIXO_ICONE = 'app-config/icon';
const STORAGE_PREFIXO_SPLASH = 'app-config/splash';

export interface AppConfigPublico {
  appName: string | null;
  appShortName: string | null;
  logoUrl: string | null;
  tema: { primaryColor: string; secondaryColor: string };
  modulos: {
    denuncia: boolean;
    mapa: boolean;
    ouvidoria: boolean;
    esic: boolean;
    chat: boolean;
    servicos: boolean;
    noticias: boolean;
    carteira: boolean;
    galeria: boolean;
    documentos: boolean;
  };
  onboarding: { ativo: boolean; slides: unknown[] };
  acessoRapido: unknown[];
  categoriasChamados: unknown[];
  push: { habilitado: boolean };
  biometria: { habilitada: boolean };
  iconUrl: string | null;
  splashUrl: string | null;
  splashBgColor: string;
}

/**
 * Service de config do App do Cidadão por tenant.
 *
 * Responsabilidades:
 *  - Get-or-create com defaults (1 linha por tenant).
 *  - Atualização parcial (campos ausentes mantêm valor atual).
 *  - Upload de ícone/splash: valida PNG + dimensões via sharp, persiste no
 *    storage e grava storage_key na tabela.
 *  - Projeta URL de icon/splash via rota protegida do backend (nunca expõe
 *    a storage_key real).
 *  - Cache Redis de curto prazo no endpoint público (igual ao tema).
 */
@Injectable()
export class AppConfigService {
  private readonly log = new Logger(AppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly storage: StorageService,
  ) {}

  // -----------------------------------------------------------------
  // Cache key
  // -----------------------------------------------------------------
  private cacheKey(): string {
    return `app-config:${TenantContext.tenantId() ?? 'default'}`;
  }

  // -----------------------------------------------------------------
  // Get-or-create
  // -----------------------------------------------------------------

  /** Retorna a linha ou cria com defaults se ainda não existir. */
  private async getOrCreate() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    let row = await this.prisma.db.tenantAppConfig.findUnique({ where: { tenantId } });
    if (!row) {
      row = await this.prisma.db.tenantAppConfig.create({ data: { tenantId } });
    }
    return row;
  }

  // -----------------------------------------------------------------
  // URL das imagens (servidas via rota protegida do backend)
  // -----------------------------------------------------------------

  /**
   * Resolve a URL pública de uma storage_key via rota de proxy do backend.
   * O storage_key real nunca é exposto ao cliente.
   */
  private urlParaKey(key: string | null): string | null {
    if (!key) return null;
    return `/api/app-config/asset?key=${encodeURIComponent(key)}`;
  }

  /**
   * Tenta resolver o logo do portal (tema) para expor como logoUrl no app.
   * A propriedade logo.url do tema já é uma URL /midia/* ou https — válida.
   */
  private async resolverLogoTema(): Promise<string | null> {
    try {
      const tema = await this.prisma.db.tenantTheme.findFirst({
        select: { tokens: true },
      });
      if (!tema) return null;
      const tokens = tema.tokens as { logo?: { url?: string } } | null;
      return tokens?.logo?.url ?? null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------
  // Endpoint público
  // -----------------------------------------------------------------

  /**
   * Projeção runtime pública: NÃO expõe bundleId, easProjectId, easOwner,
   * apiUrl. Cache curto (igual ao tema, ADR-0001).
   */
  async getPublico(): Promise<AppConfigPublico> {
    const key = this.cacheKey();
    const cached = await this.cache.get<AppConfigPublico>(key);
    if (cached) return cached;

    const row = await this.getOrCreate();
    const logoUrl = await this.resolverLogoTema();

    const result: AppConfigPublico = {
      appName: row.appName,
      appShortName: row.appShortName,
      logoUrl,
      tema: {
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
      },
      modulos: {
        denuncia: row.moduloDenuncia,
        mapa: row.moduloMapa,
        ouvidoria: row.moduloOuvidoria,
        esic: row.moduloEsic,
        chat: row.moduloChat,
        servicos: row.moduloServicos,
        noticias: row.moduloNoticias,
        carteira: row.moduloCarteira,
        galeria: row.moduloGaleria,
        documentos: row.moduloDocumentos,
      },
      onboarding: {
        ativo: row.onboardingAtivo,
        slides: (row.onboardingSlides as unknown[]) ?? [],
      },
      acessoRapido: (row.acessoRapido as unknown[]) ?? [],
      categoriasChamados: (row.categoriasChamados as unknown[]) ?? [],
      push: { habilitado: row.pushHabilitado },
      biometria: { habilitada: row.biometriaHabilitada },
      iconUrl: this.urlParaKey(row.iconStorageKey),
      splashUrl: this.urlParaKey(row.splashStorageKey),
      splashBgColor: row.splashBgColor,
    };

    await this.cache.set(key, result, TTL_APP_CONFIG);
    return result;
  }

  // -----------------------------------------------------------------
  // Admin: GET completo
  // -----------------------------------------------------------------

  /**
   * Config COMPLETA para o painel admin (inclui campos build-time).
   * Shape NORMALIZADO que o painel consome: `modulos` aninhado e strings
   * nunca-nulas (o front faz `.length` em alguns campos).
   */
  async getAdmin() {
    const row = await this.getOrCreate();
    const logoUrl = await this.resolverLogoTema();
    const s = (v: string | null | undefined) => v ?? '';

    return {
      appName: s(row.appName),
      appShortName: s(row.appShortName),
      bundleId: s(row.bundleId),
      scheme: s(row.scheme),
      apiUrl: s(row.apiUrl),
      easProjectId: s(row.easProjectId),
      easOwner: s(row.easOwner),
      appVersion: row.appVersion ?? '1.0.0',
      splashBgColor: row.splashBgColor,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      modulos: {
        denuncia: row.moduloDenuncia,
        mapa: row.moduloMapa,
        ouvidoria: row.moduloOuvidoria,
        esic: row.moduloEsic,
        chat: row.moduloChat,
        servicos: row.moduloServicos,
        noticias: row.moduloNoticias,
        carteira: row.moduloCarteira,
        galeria: row.moduloGaleria,
        documentos: row.moduloDocumentos,
      },
      onboardingAtivo: row.onboardingAtivo,
      onboardingSlides: row.onboardingSlides ?? [],
      acessoRapido: row.acessoRapido ?? [],
      categoriasChamados: row.categoriasChamados ?? [],
      pushHabilitado: row.pushHabilitado,
      biometriaHabilitada: row.biometriaHabilitada,
      logoUrl,
      iconUrl: this.urlParaKey(row.iconStorageKey),
      splashUrl: this.urlParaKey(row.splashStorageKey),
    };
  }

  // -----------------------------------------------------------------
  // Admin: PATCH
  // -----------------------------------------------------------------

  /**
   * Atualização parcial.
   * - role: papel do usuário atual (admin_prefeitura não pode tocar campos
   *   build-time como bundleId/easProjectId/easOwner/apiUrl).
   * - Campos ausentes no DTO mantêm valor atual.
   * - Invalida o cache público após gravar.
   */
  async atualizar(dto: AtualizarAppConfigDto, role: string): Promise<void> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    // Bloqueia campos restritos ao super_admin
    if (role !== Role.SUPER_ADMIN) {
      for (const campo of CAMPOS_SUPER_ADMIN) {
        if (dto[campo] !== undefined) {
          throw new ForbiddenException(
            `O campo "${campo}" só pode ser alterado por super_admin.`,
          );
        }
      }
    }

    // Monta o data apenas com os campos presentes no DTO
    const data: Record<string, unknown> = {};

    const campo = <K extends keyof AtualizarAppConfigDto>(k: K, dbField: string) => {
      if (dto[k] !== undefined) data[dbField] = dto[k];
    };

    campo('appName', 'appName');
    campo('appShortName', 'appShortName');
    campo('appVersion', 'appVersion');
    campo('bundleId', 'bundleId');
    campo('scheme', 'scheme');
    campo('apiUrl', 'apiUrl');
    campo('easProjectId', 'easProjectId');
    campo('easOwner', 'easOwner');
    campo('primaryColor', 'primaryColor');
    campo('secondaryColor', 'secondaryColor');
    campo('splashBgColor', 'splashBgColor');
    campo('moduloDenuncia', 'moduloDenuncia');
    campo('moduloMapa', 'moduloMapa');
    campo('moduloOuvidoria', 'moduloOuvidoria');
    campo('moduloEsic', 'moduloEsic');
    campo('moduloChat', 'moduloChat');
    campo('moduloServicos', 'moduloServicos');
    campo('moduloNoticias', 'moduloNoticias');
    campo('moduloCarteira', 'moduloCarteira');
    campo('moduloGaleria', 'moduloGaleria');
    campo('moduloDocumentos', 'moduloDocumentos');
    campo('onboardingSlides', 'onboardingSlides');
    campo('acessoRapido', 'acessoRapido');
    campo('categoriasChamados', 'categoriasChamados');
    campo('pushHabilitado', 'pushHabilitado');
    campo('biometriaHabilitada', 'biometriaHabilitada');
    campo('onboardingAtivo', 'onboardingAtivo');

    // O painel envia `modulos` ANINHADO ({denuncia,mapa,...}); mapeia p/ as colunas planas.
    const mods = (dto as { modulos?: Record<string, boolean> }).modulos;
    if (mods && typeof mods === 'object') {
      const mapaMod: Record<string, string> = {
        denuncia: 'moduloDenuncia', mapa: 'moduloMapa', ouvidoria: 'moduloOuvidoria',
        esic: 'moduloEsic', chat: 'moduloChat', servicos: 'moduloServicos',
        noticias: 'moduloNoticias', carteira: 'moduloCarteira',
        galeria: 'moduloGaleria', documentos: 'moduloDocumentos',
      };
      for (const [k, col] of Object.entries(mapaMod)) {
        if (typeof mods[k] === 'boolean') data[col] = mods[k];
      }
    }

    if (Object.keys(data).length === 0) {
      return; // nada a atualizar
    }

    await this.prisma.db.tenantAppConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data } as any,
      update: data as any,
    });

    await this.cache.del(this.cacheKey());
    this.log.log(`Config do app atualizada para tenant ${tenantId}.`);
  }

  // -----------------------------------------------------------------
  // Upload de ícone
  // -----------------------------------------------------------------

  /**
   * Grava o ícone do app. Exige PNG 1024×1024.
   * Retorna a URL via proxy do backend.
   */
  async uploadIcone(file: { buffer: Buffer; mimetype: string; size: number }): Promise<string> {
    this.validarArquivo(file, 'icone');
    await this.validarDimensoes(file.buffer, ICON_TAMANHO, ICON_TAMANHO, 'Ícone');

    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    const key = await this.storage.put(
      `${STORAGE_PREFIXO_ICONE}/${tenantId}`,
      file.buffer,
      'image/png',
    );

    await this.prisma.db.tenantAppConfig.upsert({
      where: { tenantId },
      create: { tenantId, iconStorageKey: key },
      update: { iconStorageKey: key },
    });

    await this.cache.del(this.cacheKey());

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: null,
        acao: 'APP_CONFIG_ICONE_UPLOAD',
        entidade: 'tenant_app_config',
        entidadeId: tenantId,
        dados: { storageKey: key },
      },
    });

    const url = this.urlParaKey(key)!;
    return url;
  }

  // -----------------------------------------------------------------
  // Upload de splash
  // -----------------------------------------------------------------

  /**
   * Grava a imagem de splash. Exige PNG.
   * Retorna a URL via proxy do backend.
   */
  async uploadSplash(file: { buffer: Buffer; mimetype: string; size: number }): Promise<string> {
    this.validarArquivo(file, 'splash');

    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    const key = await this.storage.put(
      `${STORAGE_PREFIXO_SPLASH}/${tenantId}`,
      file.buffer,
      'image/png',
    );

    await this.prisma.db.tenantAppConfig.upsert({
      where: { tenantId },
      create: { tenantId, splashStorageKey: key },
      update: { splashStorageKey: key },
    });

    await this.cache.del(this.cacheKey());

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: null,
        acao: 'APP_CONFIG_SPLASH_UPLOAD',
        entidade: 'tenant_app_config',
        entidadeId: tenantId,
        dados: { storageKey: key },
      },
    });

    const url = this.urlParaKey(key)!;
    return url;
  }

  // -----------------------------------------------------------------
  // Proxy de asset (serve o arquivo pelo backend)
  // -----------------------------------------------------------------

  /**
   * Lê o objeto do storage e retorna buffer + mime.
   * Usado pela rota GET /api/app-config/asset?key=... que faz proxy seguro.
   * Só aceita chaves do prefixo 'app-config/' para evitar traversal.
   */
  async getAsset(key: string): Promise<{ buffer: Buffer; mime: string }> {
    if (!key.startsWith('app-config/')) {
      throw new BadRequestException('Chave de asset inválida.');
    }
    return this.storage.get(key);
  }

  // -----------------------------------------------------------------
  // Helpers privados
  // -----------------------------------------------------------------

  /** Valida MIME e tamanho máximo do arquivo (deve ser PNG). */
  private validarArquivo(
    file: { buffer: Buffer; mimetype: string; size: number },
    tipo: string,
  ): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException(`Envie a imagem no campo "file" (${tipo}).`);
    }
    if (file.mimetype !== 'image/png') {
      throw new BadRequestException(`O ${tipo} deve ser um arquivo PNG (image/png).`);
    }
    const MAX = 10 * 1024 * 1024; // 10 MB
    if (file.buffer.length > MAX) {
      throw new BadRequestException(`O ${tipo} excede o tamanho máximo de 10 MB.`);
    }
  }

  /**
   * Valida dimensões da imagem com sharp.
   * Lança BadRequestException com mensagem clara se não bater.
   */
  private async validarDimensoes(
    buffer: Buffer,
    largura: number,
    altura: number,
    nome: string,
  ): Promise<void> {
    let meta: { width?: number; height?: number };
    try {
      meta = await sharp(buffer).metadata();
    } catch (e) {
      throw new BadRequestException(
        `Não foi possível ler as dimensões da imagem: ${(e as Error).message}`,
      );
    }
    if (meta.width !== largura || meta.height !== altura) {
      throw new BadRequestException(
        `${nome} deve ser ${largura}×${altura} px. Imagem enviada: ${meta.width ?? '?'}×${meta.height ?? '?'} px.`,
      );
    }
  }
}
