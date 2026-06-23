import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { ThemeService } from '../theme/theme.service';

/** Azul institucional gov.br — fallback de último recurso. */
const GOVBR_BLUE = '#1351b4';

/** Raio dos cantos do retângulo SVG em % do tamanho (estética adaptative icon). */
const SVG_RADIUS_PCT = 22.5;

@Injectable()
export class PwaService {
  private readonly log = new Logger(PwaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly theme: ThemeService,
  ) {}

  /**
   * Gera o ícone PNG do PWA para o tenant atual.
   *
   * Prioridade:
   *  1. `tenant_app_config.icon_storage_key` → redimensiona a imagem do storage.
   *  2. Fallback temático → SVG com iniciais + cor primária → PNG via sharp.
   *
   * Em qualquer erro o método retorna um PNG azul gov.br de `size×size` para
   * que o browser consiga sempre instalar o PWA.
   *
   * @param size     Dimensão do quadrado (já clampada pelo controller).
   * @param maskable Se true, aplica a zona segura maskable (arte em ~80%,
   *                 padding com a cor de fundo do tema).
   */
  async gerarIcone(size: number, maskable: boolean): Promise<Buffer> {
    try {
      return await this.tentarGerarIcone(size, maskable);
    } catch (err) {
      this.log.warn(
        `Falha ao gerar ícone PWA (tenant=${TenantContext.tenantId() ?? 'none'}): ` +
          (err as Error).message,
      );
      return this.fallbackMinimo(size);
    }
  }

  // -----------------------------------------------------------------
  // Implementação principal
  // -----------------------------------------------------------------

  private async tentarGerarIcone(size: number, maskable: boolean): Promise<Buffer> {
    // 1. Ícone PWA dedicado, configurado no Tema (PNG quadrado) → cover full-bleed.
    //    É a fonte preferencial: o admin escolhe exatamente o ícone de instalação.
    const pwaIcon = await this.carregarPwaIcon();
    if (pwaIcon) {
      return this.redimensionar(pwaIcon, size, maskable, null);
    }

    // 2. Ícone do App do Cidadão (app-config, PNG quadrado) → cover full-bleed
    const iconBuffer = await this.carregarDoStorage();
    if (iconBuffer) {
      return this.redimensionar(iconBuffer, size, maskable, null);
    }

    // 3. Logo/brasão do tenant (tema) → encaixado em quadrado com o fundo do tema
    //    (sem cortar — `contain` + margem). Só brasões reais servidos em /midia.
    const logoBuffer = await this.carregarLogo();
    if (logoBuffer) {
      const bg = await this.resolverBgColor();
      return this.comporLogo(logoBuffer, size, maskable, bg);
    }

    // 4. Fallback temático: SVG com iniciais + cor primária
    return this.gerarFallbackTematico(size, maskable);
  }

  /**
   * Carrega o ícone PWA dedicado configurado no Tema (`tokens.pwaIcon.url`).
   * Exigimos que seja uma mídia interna (`/midia/...`, PNG enviado pelo admin).
   */
  private async carregarPwaIcon(): Promise<Buffer | null> {
    try {
      const { tokens } = await this.theme.getTokens();
      return await this.bytesDeMidiaUrl((tokens as { pwaIcon?: { url?: string } })?.pwaIcon?.url);
    } catch (err) {
      this.log.debug(`pwaIcon indisponível: ${(err as Error).message}`);
      return null;
    }
  }

  // -----------------------------------------------------------------
  // Fonte 2: logo/brasão do tenant (via /midia → mediaAsset → storage)
  // -----------------------------------------------------------------

  /**
   * Carrega os bytes do brasão/logo do tenant a partir da URL do tema
   * (`tokens.logo.url`), quando ela for um brasão REAL servido pelo storage
   * (`/midia/:tipo/:categoria/:arquivo`). Placeholders e URLs externas
   * (CDN, `/brasao-placeholder.svg`) são ignorados → cai no fallback de iniciais.
   */
  private async carregarLogo(): Promise<Buffer | null> {
    try {
      const { tokens } = await this.theme.getTokens();
      return await this.bytesDeMidiaUrl(tokens?.logo?.url);
    } catch (err) {
      this.log.debug(`logo indisponível: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Baixa os bytes de uma URL de mídia INTERNA do portal
   * (`/midia/:tipo/:categoria/:arquivo`) resolvendo o `mediaAsset` (RLS por
   * tenant) e lendo do storage. Retorna null para URLs externas/placeholder
   * (CDN, `/brasao-placeholder.svg`) ou quando o asset não existe.
   */
  private async bytesDeMidiaUrl(url: string | null | undefined): Promise<Buffer | null> {
    if (!url) return null;
    const m = url.match(/^\/midia\/([^/]+)\/([^/]+)\/([^/?#]+)/);
    if (!m) return null;
    const [, tipo, categoriaSlug, arquivo] = m;
    const hash = arquivo.replace(/\.[^.]+$/, '');

    const asset = await this.prisma.db.mediaAsset.findFirst({
      where: {
        tipo: tipo as never,
        hash,
        visibilidade: 'publico',
        categoria: { slug: categoriaSlug },
      },
      select: { storageKey: true },
    });
    if (!asset?.storageKey) return null;

    const { buffer } = await this.storage.get(asset.storageKey);
    return buffer;
  }

  /**
   * Encaixa um logo (qualquer proporção, PNG/SVG, possivelmente transparente)
   * em um quadrado `size×size` com o fundo do tema, SEM cortar (`fit: contain`)
   * e com uma pequena margem. Para maskable, encolhe para ~78% (zona segura).
   */
  private async comporLogo(src: Buffer, size: number, maskable: boolean, bg: string): Promise<Buffer> {
    const fator = maskable ? 0.78 : 0.9;
    const inner = Math.max(1, Math.round(size * fator));
    const arte = await sharp(src)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return sharp({
      create: { width: size, height: size, channels: 4, background: this.hexToRgba(bg) },
    })
      .composite([{ input: arte, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  // -----------------------------------------------------------------
  // Fonte 1: storage via app-config
  // -----------------------------------------------------------------

  private async carregarDoStorage(): Promise<Buffer | null> {
    try {
      const tenantId = TenantContext.tenantId();
      if (!tenantId) return null;

      const row = await this.prisma.db.tenantAppConfig.findUnique({
        where: { tenantId },
        select: { iconStorageKey: true },
      });
      if (!row?.iconStorageKey) return null;

      const { buffer } = await this.storage.get(row.iconStorageKey);
      return buffer;
    } catch (err) {
      this.log.debug(`icon_storage_key indisponível: ${(err as Error).message}`);
      return null;
    }
  }

  // -----------------------------------------------------------------
  // Fonte 2: fallback temático
  // -----------------------------------------------------------------

  private async gerarFallbackTematico(size: number, maskable: boolean): Promise<Buffer> {
    // Lê tema para obter cor primária, primaryFg e nome do município.
    let primary = GOVBR_BLUE;
    let primaryFg = '#FFFFFF';
    let nome = 'Portal';

    try {
      const resultado = await this.theme.getTokens();
      primary = resultado.tokens.colors.primary;
      primaryFg = resultado.tokens.colors.primaryFg;
      nome = resultado.portal.nome;
    } catch (err) {
      this.log.debug(`Tema indisponível para fallback: ${(err as Error).message}`);
    }

    const iniciais = this.extrairIniciais(nome);
    const svg = this.construirSvg(primary, primaryFg, iniciais, size, maskable);
    const buffer = Buffer.from(svg, 'utf-8');

    return sharp(buffer).png().resize(size, size).toBuffer();
  }

  // -----------------------------------------------------------------
  // Helpers de imagem
  // -----------------------------------------------------------------

  /**
   * Redimensiona um buffer de imagem para `size×size`.
   * Se maskable, coloca a arte em 80% do canvas, preenchendo
   * o restante com a cor de fundo do tema (zona segura Android).
   */
  private async redimensionar(
    src: Buffer,
    size: number,
    maskable: boolean,
    bgColor: string | null,
  ): Promise<Buffer> {
    if (!maskable) {
      return sharp(src).resize(size, size, { fit: 'cover' }).png().toBuffer();
    }

    // Zona segura maskable: arte ocupa 80%, rodeada por fundo
    const innerSize = Math.round(size * 0.8);
    const bg = bgColor ?? (await this.resolverBgColor());

    const inner = await sharp(src)
      .resize(innerSize, innerSize, { fit: 'cover' })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: this.hexToRgba(bg),
      },
    })
      .composite([{ input: inner, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  private async resolverBgColor(): Promise<string> {
    try {
      const resultado = await this.theme.getTokens();
      return resultado.tokens.colors.bg;
    } catch {
      return '#FFFFFF';
    }
  }

  /**
   * Constrói um SVG quadrado com retângulo arredondado + texto de iniciais.
   * Quando maskable=true, a arte fica em 80% do canvas (zona segura).
   */
  private construirSvg(
    primary: string,
    primaryFg: string,
    iniciais: string,
    size: number,
    maskable: boolean,
  ): string {
    const artSize = maskable ? size * 0.8 : size;
    const offset = maskable ? (size - artSize) / 2 : 0;
    const r = artSize * (SVG_RADIUS_PCT / 100);
    const fontSize = artSize * 0.38;
    const cx = offset + artSize / 2;
    const cy = offset + artSize / 2;

    // Cor de fundo do canvas (para maskable, usa o bg do tema se disponível;
    // no fallback síncrono usamos branco — o SVG é renderizado por sharp)
    const bgCanvas = maskable ? '#FFFFFF' : primary;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bgCanvas}"/>
  <rect x="${offset}" y="${offset}" width="${artSize}" height="${artSize}" rx="${r}" ry="${r}" fill="${primary}"/>
  <text
    x="${cx}"
    y="${cy}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="${primaryFg}"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="-1"
  >${iniciais}</text>
</svg>`;
  }

  /** Extrai 1-2 iniciais maiúsculas do nome do município. */
  private extrairIniciais(nome: string): string {
    const palavras = nome
      .trim()
      .split(/\s+/)
      .filter(
        (p) =>
          p.length > 2 &&
          !['de', 'da', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()),
      );

    if (palavras.length === 0) return 'P';
    if (palavras.length === 1) return palavras[0].charAt(0).toUpperCase();
    return (palavras[0].charAt(0) + palavras[1].charAt(0)).toUpperCase();
  }

  /** Converte cor hex para objeto RGBA aceito pelo sharp (channels: 4). */
  private hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      alpha: 1,
    };
  }

  // -----------------------------------------------------------------
  // Fallback de último recurso (nunca deve falhar)
  // -----------------------------------------------------------------

  /** Quadrado azul gov.br — não depende de sharp com SVG complexo. */
  private async fallbackMinimo(size: number): Promise<Buffer> {
    try {
      const rgba = this.hexToRgba(GOVBR_BLUE);
      return await sharp({
        create: { width: size, height: size, channels: 4, background: rgba },
      })
        .png()
        .toBuffer();
    } catch {
      // Se até o sharp falhar, devolve um PNG mínimo hardcoded (1×1 px azul gov.br)
      // gerado offline — nunca lança exceção.
      return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
    }
  }
}
