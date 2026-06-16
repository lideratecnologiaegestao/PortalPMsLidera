import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MediaStorageService } from './media-storage.service';
import {
  ehImagem,
  extDoMime,
  gerarHash,
  mimeParaTipo,
  montarStorageKey,
  montarUrlPublica,
  type MediaVisibilidade,
} from './media.types';
import { validarUploadSeguro } from '../../common/upload/upload-seguranca.util';
import {
  aplicarCorBase,
  aplicarSubstituicoesCores,
  ehSvgValido,
  extrairCoresUnicas,
  sanitizarSvg,
  SVG_MAX_BYTES,
  SVG_MAX_CORES,
} from './svg-sanitizar.util';

/**
 * import() REAL em runtime. O TS (module: commonjs) transpila `import()` para
 * `require()`, o que quebra pacotes ESM-only (ex.: file-type v20). Este helper
 * preserva o import dinâmico nativo do Node, que carrega ESM a partir de CJS.
 */
const importDinamico = new Function('m', 'return import(m)') as <T = any>(
  m: string,
) => Promise<T>;

/** Arquivo recebido via multipart (Multer). */
interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface UploadDto {
  categoriaId: string;
  visibilidade?: MediaVisibilidade;
  altText?: string;
}

const TAMANHO_MAX = Number(process.env.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024); // 25MB

/**
 * Corrige mojibake em nomes de arquivo enviados via multipart.
 *
 * Navegadores mais antigos / busboy (em algumas versões) interpretam nomes de
 * arquivo como latin1, resultando em sequências do tipo "Ã¢" (U+00C3 U+00A2)
 * onde deveria estar "â" (UTF-8 de 2 bytes 0xC3 0xA2).
 *
 * Estratégia: se o nome contiver caracteres latin1 típicos de mojibake UTF-8
 * (U+00C0–U+00FF, que são os altos bytes de sequências UTF-8 de 2+ bytes
 * mal-interpretados), re-decodifica como latin1 → UTF-8.
 * Nomes já em UTF-8 correto NÃO são tocados.
 */
function corrigirMojibake(nome: string): string {
  // Detecta sequência de mojibake: U+00C0–U+00FF (latin1 high bytes usados
  // em sequências UTF-8 de 2 bytes, ex.: Ã = 0xC3, © = 0xA9)
  if (/[\xC0-\xFF]/.test(nome)) {
    try {
      const corrigido = Buffer.from(nome, 'latin1').toString('utf8');
      // Só usa a versão corrigida se for UTF-8 válido e não contiver U+FFFD
      if (!corrigido.includes('�')) {
        return corrigido;
      }
    } catch {
      // Falha silenciosa: mantém o nome original
    }
  }
  return nome;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
  ) {}

  private tenantId(): string {
    const id = TenantContext.get().tenantId;
    if (!id) throw new BadRequestException('Tenant não resolvido');
    return id;
  }

  // ------------------------------------------------------------------- upload
  async upload(file: UploadFile, dto: UploadDto, userId?: string) {
    if (!file) throw new BadRequestException('Arquivo ausente');

    let mime: string;
    let buffer = file.buffer;
    let largura: number | undefined;
    let altura: number | undefined;

    // SVG é vetor de XSS — a denylist GLOBAL (EXTENSOES_PERIGOSAS) bloqueia .svg
    // em todos os uploads. Na Biblioteca de Mídia liberamos SOMENTE aqui, e com
    // SANITIZAÇÃO obrigatória do conteúdo (+ CSP/nosniff ao servir, defesa extra).
    const pareceSvg =
      file.mimetype === 'image/svg+xml' ||
      /\.svg$/i.test((file.originalname || '').trim()) ||
      ehSvgValido(file.buffer.toString('utf8', 0, 512));

    if (pareceSvg) {
      if (file.size > SVG_MAX_BYTES) {
        throw new BadRequestException(
          `SVG excede o tamanho máximo (${Math.round(SVG_MAX_BYTES / 1024 / 1024)} MB).`,
        );
      }
      const conteudo = file.buffer.toString('utf8');
      if (!ehSvgValido(conteudo)) {
        throw new BadRequestException('Conteúdo SVG inválido.');
      }
      buffer = Buffer.from(sanitizarSvg(conteudo), 'utf8');
      mime = 'image/svg+xml';
    } else {
      // Valida extensão/tamanho contra lista de extensões perigosas ANTES de qualquer
      // processamento. O MIME é re-detectado após (file-type), mas já bloqueamos pelo nome.
      validarUploadSeguro(file, { maxBytes: TAMANHO_MAX });
      mime = await this.detectarMime(file);
      // processamento de imagem: dimensões + remoção de EXIF/GPS (privacidade)
      if (ehImagem(mime) && mime !== 'image/svg+xml') {
        const sharp = (await importDinamico('sharp')).default;
        const img = sharp(buffer, { failOn: 'none' });
        const meta = await img.metadata();
        largura = meta.width;
        altura = meta.height;
        buffer = await img.rotate().toBuffer(); // .rotate() aplica orientação e descarta EXIF
      }
    }

    const tipo = mimeParaTipo(mime);
    if (!tipo) throw new BadRequestException(`Tipo de arquivo não permitido: ${mime}`);

    const categoria = await this.prisma.db.mediaCategory.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria || categoria.tipo !== tipo) {
      throw new BadRequestException('Categoria inválida para o tipo do arquivo');
    }

    const visibilidade: MediaVisibilidade = dto.visibilidade ?? 'restrito';
    if (tipo === 'imagem' && visibilidade === 'publico' && !dto.altText?.trim()) {
      throw new BadRequestException('Imagem pública exige texto alternativo (alt)');
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const tenantId = this.tenantId();

    // dedup: mesmo conteúdo já enviado nesta categoria → reaproveita
    const existente = await this.prisma.db.mediaAsset.findFirst({
      where: { checksum, categoriaId: categoria.id },
    });
    if (existente) return this.toDto(existente, categoria.slug);

    const ext = extDoMime(mime);
    const hash = gerarHash();
    const storageKey = montarStorageKey({
      tenantId,
      tipo,
      categoriaSlug: categoria.slug,
      hash,
      ext,
    });

    await this.storage.put(storageKey, buffer, mime);

    const asset = await this.prisma.db.mediaAsset.create({
      data: {
        tenantId,
        tipo,
        categoriaId: categoria.id,
        visibilidade,
        nomeOriginal: corrigirMojibake(file.originalname),
        hash,
        ext,
        mime,
        tamanhoBytes: buffer.length,
        largura,
        altura,
        checksum,
        altText: dto.altText,
        storageKey,
        uploadedBy: userId,
      } as any,
    });

    await this.audit('media.upload', asset.id, userId, { tipo, visibilidade });
    return this.toDto(asset, categoria.slug);
  }

  // -------------------------------------------------------------- listagem
  async list(filtros: { tipo?: string; categoria?: string; q?: string; page?: number }) {
    const page = Math.max(1, filtros.page ?? 1);
    const take = 40;
    // A galeria/picker do admin lista APENAS o acervo do portal (publico).
    // Mídia restrita (cidadão/anexos) NUNCA aparece aqui — só no controle
    // interno correspondente (LGPD: minimização e acesso restrito).
    const where: any = { visibilidade: 'publico' };
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.categoria) where.categoria = { slug: filtros.categoria };
    if (filtros.q) where.nomeOriginal = { contains: filtros.q, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.db.mediaAsset.findMany({
        where,
        include: { categoria: true },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.db.mediaAsset.count({ where }),
    ]);
    return {
      page,
      total,
      items: items.map((a: any) => this.toDto(a, a.categoria.slug)),
    };
  }

  async getMetadata(id: string) {
    const a = await this.prisma.db.mediaAsset.findUnique({
      where: { id },
      include: { categoria: true },
    });
    if (!a) throw new NotFoundException();
    return this.toDto(a as any, (a as any).categoria.slug);
  }

  async update(id: string, dto: { altText?: string; categoriaId?: string }, userId?: string) {
    const a = await this.prisma.db.mediaAsset.update({
      where: { id },
      data: { altText: dto.altText, categoriaId: dto.categoriaId } as any,
      include: { categoria: true },
    });
    await this.audit('media.update', id, userId, dto);
    return this.toDto(a as any, (a as any).categoria.slug);
  }

  async remove(id: string, userId?: string) {
    const a = await this.prisma.db.mediaAsset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    await this.storage.delete((a as any).storageKey);
    await this.prisma.db.mediaAsset.delete({ where: { id } });
    await this.audit('media.delete', id, userId, { nome: (a as any).nomeOriginal });
    return { removido: true };
  }

  // -------------------------------------------------- editor de cores SVG

  /**
   * Retorna o conteúdo sanitizado de um SVG e suas cores únicas.
   * GET /api/midia/:id/svg-conteudo
   */
  async svgConteudo(id: string): Promise<{ conteudo: string; coresUnicas: string[] }> {
    const asset = await this.prisma.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException();

    if ((asset as any).mime !== 'image/svg+xml') {
      throw new BadRequestException('O asset não é um SVG (image/svg+xml)');
    }

    const buffer = await this.storage.getBuffer((asset as any).storageKey);

    if (buffer.length > SVG_MAX_BYTES) {
      throw new BadRequestException(
        `SVG excede o limite de ${SVG_MAX_BYTES / 1024 / 1024} MB para edição`,
      );
    }

    const texto = buffer.toString('utf8');

    if (!ehSvgValido(texto)) {
      throw new BadRequestException('Conteúdo não é um SVG válido');
    }

    const conteudo = sanitizarSvg(texto);
    const coresUnicas = extrairCoresUnicas(conteudo);

    return { conteudo, coresUnicas };
  }

  /**
   * Cria um NOVO asset SVG recolorido a partir do original.
   * POST /api/midia/:id/recolorir
   *
   * Nunca altera o asset original — gera uma cópia com as substituições aplicadas.
   *
   * Campos:
   * - `substituicoes`: mapa de cores (hex ou nome CSS → hex). Pode ser vazio se
   *   `corBase` for informado.
   * - `corBase`: hex opcional. Se informado, define/substitui o atributo `fill`
   *   no elemento `<svg>` raiz, recolorindo elementos com cor herdada/implícita
   *   (ex.: linhas pretas do CorelDRAW sem fill explícito).
   */
  async recolorir(
    id: string,
    dto: {
      substituicoes: Record<string, string>;
      categoriaId: string;
      visibilidade: MediaVisibilidade;
      altText?: string;
      corBase?: string;
    },
    userId?: string,
  ) {
    const temCorBase = !!dto.corBase?.trim();

    // Valida limite de substituições
    const qtdSubs = Object.keys(dto.substituicoes ?? {}).length;
    if (qtdSubs === 0 && !temCorBase) {
      throw new BadRequestException('substituicoes não pode ser vazio (ou informe corBase)');
    }
    if (qtdSubs > SVG_MAX_CORES) {
      throw new BadRequestException(`Máximo de ${SVG_MAX_CORES} substituições por operação`);
    }

    // Valida corBase se informado
    if (temCorBase && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(dto.corBase!)) {
      throw new BadRequestException(`corBase inválida: ${dto.corBase}`);
    }

    // Valida que todas as chaves e valores de substituicoes são válidos
    // Chaves podem ser hex ou nome de cor CSS; valores devem ser hex
    for (const [de, para] of Object.entries(dto.substituicoes ?? {})) {
      const ehHex = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(de);
      const ehNome = /^[a-zA-Z]+$/.test(de); // nomes de cor são apenas letras
      if (!ehHex && !ehNome) {
        throw new BadRequestException(`Cor de origem inválida: ${de}`);
      }
      if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(para)) {
        throw new BadRequestException(`Cor de destino inválida: ${para}`);
      }
    }

    // Carrega e valida o asset original (RLS automático via prisma.db)
    const original = await this.prisma.db.mediaAsset.findUnique({ where: { id } });
    if (!original) throw new NotFoundException();

    if ((original as any).mime !== 'image/svg+xml') {
      throw new BadRequestException('O asset não é um SVG (image/svg+xml)');
    }

    // Valida categoria de destino
    const categoria = await this.prisma.db.mediaCategory.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria || categoria.tipo !== 'imagem') {
      throw new BadRequestException('Categoria inválida para imagem SVG');
    }

    // Imagem pública exige altText
    if (dto.visibilidade === 'publico' && !dto.altText?.trim()) {
      throw new BadRequestException('Imagem pública exige texto alternativo (altText)');
    }

    // Lê, valida e sanitiza o original
    const buffer = await this.storage.getBuffer((original as any).storageKey);

    if (buffer.length > SVG_MAX_BYTES) {
      throw new BadRequestException(
        `SVG excede o limite de ${SVG_MAX_BYTES / 1024 / 1024} MB para edição`,
      );
    }

    const textoOriginal = buffer.toString('utf8');

    if (!ehSvgValido(textoOriginal)) {
      throw new BadRequestException('Conteúdo não é um SVG válido');
    }

    // Sanitiza ANTES de aplicar substituições (defesa em profundidade)
    const textoSanitizado = sanitizarSvg(textoOriginal);

    // Aplica substituições de cor (suporta chaves hex e nomes CSS)
    let textoRecolorido = aplicarSubstituicoesCores(textoSanitizado, dto.substituicoes ?? {});

    // Aplica corBase: define/substitui fill no elemento <svg> raiz para
    // recolorir elementos com cor herdada/implícita (ex.: preto padrão CorelDRAW)
    if (temCorBase) {
      textoRecolorido = aplicarCorBase(textoRecolorido, dto.corBase!);
    }

    const novoBuffer = Buffer.from(textoRecolorido, 'utf8');
    const checksum = createHash('sha256').update(novoBuffer).digest('hex');
    const tenantId = this.tenantId();

    // Dedup: se já existe um SVG idêntico nessa categoria, retorna ele
    const existente = await this.prisma.db.mediaAsset.findFirst({
      where: { checksum, categoriaId: dto.categoriaId },
    });
    if (existente) {
      return this.toDto(existente as any, categoria.slug);
    }

    // Deriva nome original: {nome-sem-ext}-recolorido.svg
    const nomeBase = ((original as any).nomeOriginal as string)
      .replace(/\.svg$/i, '')
      .replace(/-recolorido$/, ''); // evita duplicar sufixo
    const nomeOriginal = `${nomeBase}-recolorido.svg`;

    const hash = gerarHash();
    const storageKey = montarStorageKey({
      tenantId,
      tipo: 'imagem',
      categoriaSlug: categoria.slug,
      hash,
      ext: 'svg',
    });

    await this.storage.put(storageKey, novoBuffer, 'image/svg+xml');

    const novoAsset = await this.prisma.db.mediaAsset.create({
      data: {
        tenantId,
        tipo: 'imagem',
        categoriaId: categoria.id,
        visibilidade: dto.visibilidade,
        nomeOriginal,
        hash,
        ext: 'svg',
        mime: 'image/svg+xml',
        tamanhoBytes: novoBuffer.length,
        largura: (original as any).largura,
        altura: (original as any).altura,
        checksum,
        altText: dto.altText,
        storageKey,
        uploadedBy: userId,
      } as any,
    });

    await this.audit('media.svg_recolorir', novoAsset.id, userId, {
      originalId: id,
      categoriaId: dto.categoriaId,
      visibilidade: dto.visibilidade,
      qtdSubstituicoes: qtdSubs,
      corBase: dto.corBase ?? null,
    });

    return this.toDto(novoAsset as any, categoria.slug);
  }

  // ----------------------------------------------------- rota pública mascarada
  /** Resolve /midia/[tipo]/[categoria]/[hash].[ext] sem expor o storage_key. */
  async resolvePublico(tipo: string, categoriaSlug: string, arquivo: string) {
    const hash = arquivo.replace(/\.[^.]+$/, '');
    const asset = await this.prisma.db.mediaAsset.findFirst({
      where: {
        tipo: tipo as any,
        hash,
        visibilidade: 'publico',
        categoria: { slug: categoriaSlug },
      },
    });
    if (!asset) throw new NotFoundException(); // 404 genérico (evita enumeração)
    const obj = await this.storage.getStream((asset as any).storageKey);
    return { asset, ...obj };
  }

  // -------------------------------------------------- acesso privado (restrito)
  /** Serve mídia restrita só a quem tem permissão. Sem cache. Auditado. */
  async getPrivado(id: string, user?: { id?: string; role?: string }) {
    const asset = await this.prisma.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException();
    if ((asset as any).visibilidade !== 'restrito') {
      // mídia pública não passa por aqui
      throw new NotFoundException();
    }
    const autorizado = await this.podeVerRestrito(asset as any, user);
    if (!autorizado) throw new ForbiddenException();

    await this.audit('media.acesso_restrito', id, user?.id, {});
    const obj = await this.storage.getStream((asset as any).storageKey);
    return { asset, ...obj };
  }

  /**
   * Regra de acesso à mídia restrita: o dono (uploader/cidadão) ou um servidor
   * da secretaria de destino / ouvidoria. Implementar a checagem completa de
   * ownership/destino consultando o vínculo (manifestação/chamado).
   */
  private async podeVerRestrito(
    asset: { uploadedBy?: string },
    user?: { id?: string; role?: string },
  ): Promise<boolean> {
    if (!user?.id) return false;
    if (asset.uploadedBy && asset.uploadedBy === user.id) return true;
    const internos = ['admin_prefeitura', 'gestor', 'ouvidor', 'servidor', 'super_admin'];
    if (user.role && internos.includes(user.role)) return true; // refinar por secretaria/destino
    return false;
  }

  // ------------------------------------------------------------- categorias
  listarCategorias(tipo?: string) {
    return this.prisma.db.mediaCategory.findMany({
      where: tipo ? { tipo: tipo as any } : {},
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  }

  async criarCategoria(dto: { tipo: string; nome: string; slug: string; descricao?: string }) {
    return this.prisma.db.mediaCategory.create({
      data: { tenantId: this.tenantId(), ...dto } as any,
    });
  }

  // --------------------------------------------------------------- helpers
  private toDto(a: any, categoriaSlug: string) {
    const publico = a.visibilidade === 'publico';
    return {
      id: a.id,
      tipo: a.tipo,
      categoria: categoriaSlug,
      visibilidade: a.visibilidade,
      nomeOriginal: a.nomeOriginal,
      mime: a.mime,
      ext: a.ext,
      tamanhoBytes: Number(a.tamanhoBytes),
      largura: a.largura,
      altura: a.altura,
      altText: a.altText,
      criadoEm: a.criadoEm,
      // caminho público só existe para escopo 'publico' — restrito jamais tem URL
      urlPublica: publico
        ? montarUrlPublica({ tipo: a.tipo, categoriaSlug, hash: a.hash, ext: a.ext })
        : null,
      // storageKey NUNCA é retornado
    };
  }

  /** Validação por magic bytes (não confia no mimetype declarado). */
  private async detectarMime(file: UploadFile): Promise<string> {
    // SVG é texto — file-type não detecta; validar pelo conteúdo.
    // trimStart() + strip-BOM (U+FEFF) garante consistência com ehSvgValido,
    // evitando que um SVG com BOM seja classificado como outro tipo.
    const raw = file.buffer.subarray(0, 512).toString('utf8');
    // U+FEFF = BOM UTF-8; removido antes de trimStart() p/ consistência com ehSvgValido
    const head = raw.replace(/^﻿/, '').trimStart();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
      return 'image/svg+xml';
    }
    const { fileTypeFromBuffer } = await importDinamico('file-type');
    const ft = await fileTypeFromBuffer(file.buffer);
    return ft?.mime ?? file.mimetype;
  }

  private audit(acao: string, entidadeId: string, atorId?: string, dados: any = {}) {
    return this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.get().tenantId ?? null,
        atorId,
        acao,
        entidade: 'media_asset',
        entidadeId,
        dados,
      } as any,
    });
  }
}
