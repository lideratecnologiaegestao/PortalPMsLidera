import {
  BadRequestException,
  ConflictException,
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
  /** Rótulo opcional (taxonomia editável media_tipos); não afeta preview/MIME. */
  tipoMidiaId?: string;
}

/** Normaliza um texto em slug URL-safe (minúsculo, sem acento, hífens). */
function slugify(texto: string): string {
  return (
    (texto || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '') // remove acentos sem caracteres combinantes literais
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

const TAMANHO_MAX = Number(process.env.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024); // 25MB

/** Formatos fixos do sistema (enum media_tipo) — controlam preview/MIME/storage. */
const MEDIA_TIPOS_SISTEMA = ['imagem', 'documento', 'video', 'audio', 'outro'];

/** Valida cor hex (#rgb ou #rrggbb); '' → null. Mesma regra de recolorir/corBase. */
function validarCorHex(cor?: string): string | null {
  const c = (cor ?? '').trim();
  if (!c) return null;
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c)) {
    throw new BadRequestException('Cor inválida (use hex, ex.: #1a2b3c).');
  }
  return c;
}

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
    if (!categoria || categoria.tipo !== tipo || (categoria as any).ativo === false) {
      throw new BadRequestException('Categoria inválida ou desativada para o tipo do arquivo');
    }

    const visibilidade: MediaVisibilidade = dto.visibilidade ?? 'restrito';
    if (tipo === 'imagem' && visibilidade === 'publico' && !dto.altText?.trim()) {
      throw new BadRequestException('Imagem pública exige texto alternativo (alt)');
    }

    // Rótulo opcional (taxonomia editável). RLS garante que só um tipo do próprio
    // tenant é aceito; id inexistente/de outro tenant → rejeita.
    const tipoMidiaId = await this.validarTipoMidia(dto.tipoMidiaId);

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
        tipoMidiaId,
      } as any,
    });

    await this.audit('media.upload', asset.id, userId, { tipo, visibilidade });
    return this.toDto(asset, categoria.slug);
  }

  // -------------------------------------------------------------- listagem
  async list(filtros: {
    tipo?: string;
    categoria?: string;
    tipoMidia?: string;
    q?: string;
    page?: number;
  }) {
    const page = Math.max(1, filtros.page ?? 1);
    const take = 40;
    // A galeria/picker do admin lista APENAS o acervo do portal (publico).
    // Mídia restrita (cidadão/anexos) NUNCA aparece aqui — só no controle
    // interno correspondente (LGPD: minimização e acesso restrito).
    const where: any = { visibilidade: 'publico' };
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.categoria) where.categoria = { slug: filtros.categoria };
    if (filtros.q) where.nomeOriginal = { contains: filtros.q, mode: 'insensitive' };

    if (filtros.tipoMidia) where.tipoMidia = { slug: filtros.tipoMidia };

    const [items, total] = await Promise.all([
      this.prisma.db.mediaAsset.findMany({
        where,
        include: { categoria: true, tipoMidia: true },
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
      include: { categoria: true, tipoMidia: true },
    });
    if (!a) throw new NotFoundException();
    return this.toDto(a as any, (a as any).categoria.slug);
  }

  async update(
    id: string,
    dto: { altText?: string; categoriaId?: string; tipoMidiaId?: string | null },
    userId?: string,
  ) {
    // Pré-checa existência (RLS-scoped): id inexistente/de outro tenant → 404,
    // não 500 (P2025). Consistente com remove()/getMetadata().
    const existe = await this.prisma.db.mediaAsset.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException();

    const data: any = { altText: dto.altText, categoriaId: dto.categoriaId };
    // Só mexe no rótulo quando a chave veio no corpo (undefined = não alterar;
    // null/'' = remover rótulo; id = valida e vincula).
    if ('tipoMidiaId' in dto) {
      data.tipoMidiaId = await this.validarTipoMidia(dto.tipoMidiaId);
    }
    const a = await this.prisma.db.mediaAsset.update({
      where: { id },
      data,
      include: { categoria: true, tipoMidia: true },
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
    if (!categoria || categoria.tipo !== 'imagem' || (categoria as any).ativo === false) {
      throw new BadRequestException('Categoria inválida ou desativada para imagem SVG');
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
  /** Seletor (upload/filtro): categorias, opcionalmente por formato. */
  listarCategorias(tipo?: string) {
    return this.prisma.db.mediaCategory.findMany({
      where: tipo ? { tipo: tipo as any } : {},
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  }

  /** Hub de taxonomias: todas as categorias (inclui inativas) com `ativo`. */
  listarCategoriasTodas() {
    return this.prisma.db.mediaCategory.findMany({
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  }

  async criarCategoria(dto: {
    tipo: string;
    nome: string;
    slug?: string;
    descricao?: string;
    ativo?: boolean;
  }) {
    const nome = (dto.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome.');
    const tipo = dto.tipo as any;
    if (!MEDIA_TIPOS_SISTEMA.includes(dto.tipo)) {
      throw new BadRequestException('Formato inválido.');
    }
    const tenantId = this.tenantId();
    const slug = await this.slugUnicoCategoria(slugify(dto.slug || nome), tenantId, tipo);
    const cat = await this.prisma.db.mediaCategory.create({
      data: {
        tenantId,
        tipo,
        nome,
        slug,
        descricao: dto.descricao?.trim() || null,
        ativo: dto.ativo ?? true,
      } as any,
    });
    await this.audit('media.categoria_criada', cat.id, undefined, { nome, tipo }, 'media_category');
    return cat;
  }

  async atualizarCategoria(
    id: string,
    dto: { nome?: string; tipo?: string; descricao?: string; ativo?: boolean },
  ) {
    const atual = await this.prisma.db.mediaCategory.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Categoria não encontrada.');
    if (dto.tipo !== undefined && !MEDIA_TIPOS_SISTEMA.includes(dto.tipo)) {
      throw new BadRequestException('Formato inválido.');
    }
    const data: any = {};
    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      if (!nome) throw new BadRequestException('Informe o nome.');
      data.nome = nome;
    }
    if (dto.tipo !== undefined) data.tipo = dto.tipo as any;
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim() || null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    // slug é imutável (URLs públicas dependem dele). Se o formato mudou, garante
    // que o slug atual não colide sob o novo formato.
    const tipoFinal = (data.tipo ?? (atual as any).tipo) as any;
    if (data.tipo && tipoFinal !== (atual as any).tipo) {
      const colide = await this.prisma.db.mediaCategory.findFirst({
        where: { tipo: tipoFinal, slug: (atual as any).slug, id: { not: id } },
      });
      if (colide) {
        throw new ConflictException('Já existe uma categoria com este nome neste formato.');
      }
    }
    const cat = await this.prisma.db.mediaCategory.update({ where: { id }, data });
    await this.audit('media.categoria_atualizada', id, undefined, dto, 'media_category');
    return cat;
  }

  async excluirCategoria(id: string) {
    const cat = await this.prisma.db.mediaCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    // FK RESTRICT em media_assets.categoria_id: não exclui categoria em uso.
    const emUso = await this.prisma.db.mediaAsset.count({ where: { categoriaId: id } });
    if (emUso > 0) {
      throw new ConflictException(
        `Categoria em uso por ${emUso} mídia(s). Desative-a em vez de excluir.`,
      );
    }
    await this.prisma.db.mediaCategory.delete({ where: { id } });
    await this.audit('media.categoria_excluida', id, undefined, { nome: (cat as any).nome }, 'media_category');
    return { removido: true };
  }

  // -------------------------------------------------- tipos de mídia (rótulos)
  /** Seletor (upload/edição): tipos ATIVOS. */
  listarTipos() {
    return this.prisma.db.mediaTipoMidia.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
  }

  /** Hub de taxonomias: todos os tipos (inclui inativos). */
  listarTiposTodas() {
    return this.prisma.db.mediaTipoMidia.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
  }

  async criarTipo(dto: {
    nome: string;
    descricao?: string;
    icone?: string;
    cor?: string;
    ordem?: number;
    ativo?: boolean;
  }) {
    const nome = (dto.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome.');
    const tenantId = this.tenantId();
    const slug = await this.slugUnicoTipo(slugify(nome), tenantId);
    const t = await this.prisma.db.mediaTipoMidia.create({
      data: {
        tenantId,
        nome,
        slug,
        descricao: dto.descricao?.trim() || null,
        icone: dto.icone?.trim() || null,
        cor: validarCorHex(dto.cor),
        ordem: Number.isFinite(dto.ordem as number) ? Number(dto.ordem) : 0,
        ativo: dto.ativo ?? true,
      } as any,
    });
    await this.audit('media.tipo_criado', t.id, undefined, { nome }, 'media_tipo');
    return t;
  }

  async atualizarTipo(
    id: string,
    dto: {
      nome?: string;
      descricao?: string;
      icone?: string;
      cor?: string;
      ordem?: number;
      ativo?: boolean;
    },
  ) {
    const atual = await this.prisma.db.mediaTipoMidia.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Tipo não encontrado.');
    const data: any = {};
    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      if (!nome) throw new BadRequestException('Informe o nome.');
      data.nome = nome;
    }
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim() || null;
    if (dto.icone !== undefined) data.icone = dto.icone.trim() || null;
    if (dto.cor !== undefined) data.cor = validarCorHex(dto.cor);
    if (dto.ordem !== undefined && Number.isFinite(Number(dto.ordem))) data.ordem = Number(dto.ordem);
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    const t = await this.prisma.db.mediaTipoMidia.update({ where: { id }, data });
    await this.audit('media.tipo_atualizado', id, undefined, dto, 'media_tipo');
    return t;
  }

  async excluirTipo(id: string) {
    const t = await this.prisma.db.mediaTipoMidia.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo não encontrado.');
    // ON DELETE SET NULL: excluir apenas remove o rótulo das mídias vinculadas.
    await this.prisma.db.mediaTipoMidia.delete({ where: { id } });
    await this.audit('media.tipo_excluido', id, undefined, { nome: (t as any).nome }, 'media_tipo');
    return { removido: true };
  }

  // -------------------------------------------------- helpers de taxonomia
  /** Valida um rótulo opcional; null quando ausente. Erro se id não existir. */
  private async validarTipoMidia(tipoMidiaId?: string | null): Promise<string | null> {
    const id = (tipoMidiaId ?? '').trim();
    if (!id) return null;
    const t = await this.prisma.db.mediaTipoMidia.findUnique({ where: { id } });
    if (!t) throw new BadRequestException('Tipo de mídia inválido.');
    return id;
  }

  private async slugUnicoCategoria(
    base: string,
    tenantId: string,
    tipo: any,
  ): Promise<string> {
    let slug = base;
    let n = 1;
    // UNIQUE (tenant_id, tipo, slug): garante unicidade dentro do formato.
    while (
      await this.prisma.db.mediaCategory.findFirst({ where: { tenantId, tipo, slug } })
    ) {
      n += 1;
      slug = `${base}-${n}`;
    }
    return slug;
  }

  private async slugUnicoTipo(base: string, tenantId: string): Promise<string> {
    let slug = base;
    let n = 1;
    while (await this.prisma.db.mediaTipoMidia.findFirst({ where: { tenantId, slug } })) {
      n += 1;
      slug = `${base}-${n}`;
    }
    return slug;
  }

  // --------------------------------------------------------------- helpers
  private toDto(a: any, categoriaSlug: string) {
    const publico = a.visibilidade === 'publico';
    return {
      id: a.id,
      tipo: a.tipo,
      categoria: categoriaSlug,
      // rótulo opcional (taxonomia editável); null quando não vinculado/carregado
      tipoMidiaId: a.tipoMidiaId ?? null,
      tipoMidia: a.tipoMidia
        ? { id: a.tipoMidia.id, nome: a.tipoMidia.nome, slug: a.tipoMidia.slug }
        : null,
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

  private audit(
    acao: string,
    entidadeId: string,
    atorId?: string,
    dados: any = {},
    entidade = 'media_asset',
  ) {
    return this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.get().tenantId ?? null,
        atorId,
        acao,
        entidade,
        entidadeId,
        dados,
      } as any,
    });
  }
}
