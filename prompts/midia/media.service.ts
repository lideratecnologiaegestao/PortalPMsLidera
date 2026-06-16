import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from './storage.service';
import {
  ehImagem,
  extDoMime,
  gerarHash,
  mimeParaTipo,
  montarStorageKey,
  montarUrlPublica,
  type MediaVisibilidade,
} from './media.types';

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

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private tenantId(): string {
    const id = TenantContext.get().tenantId;
    if (!id) throw new BadRequestException('Tenant não resolvido');
    return id;
  }

  // ------------------------------------------------------------------- upload
  async upload(file: UploadFile, dto: UploadDto, userId?: string) {
    if (!file) throw new BadRequestException('Arquivo ausente');
    if (file.size > TAMANHO_MAX) throw new BadRequestException('Arquivo excede o limite');

    const mime = await this.detectarMime(file);
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

    // processamento de imagem: dimensões + remoção de EXIF/GPS (privacidade)
    let buffer = file.buffer;
    let largura: number | undefined;
    let altura: number | undefined;
    if (ehImagem(mime) && mime !== 'image/svg+xml') {
      const sharp = (await import('sharp')).default;
      const img = sharp(buffer, { failOn: 'none' });
      const meta = await img.metadata();
      largura = meta.width;
      altura = meta.height;
      buffer = await img.rotate().toBuffer(); // .rotate() aplica orientação e descarta EXIF
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
        nomeOriginal: file.originalname,
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

  /** Upload do cidadão: SEMPRE restrito, vinculado a uma manifestação/chamado. */
  async uploadCidadao(
    file: UploadFile,
    dto: { categoriaId: string; manifestacaoId?: string; chamadoId?: string },
    userId?: string,
  ) {
    const asset = await this.upload(
      file,
      { categoriaId: dto.categoriaId, visibilidade: 'restrito' },
      userId,
    );
    // vínculo com o registro de origem (controle interno) — sem rota pública
    if (dto.manifestacaoId) {
      await this.prisma.db.manifestacaoAnexo.create({
        data: {
          tenantId: this.tenantId(),
          manifestacaoId: dto.manifestacaoId,
          origem: 'cidadao',
          nomeArquivo: asset.nomeOriginal,
          storageKey: '(via media_asset)',
          mime: asset.mime,
          tamanhoBytes: asset.tamanhoBytes,
          mediaAssetId: asset.id,
        } as any,
      });
    }
    if (dto.chamadoId) {
      await this.prisma.db.chamadoFoto.create({
        data: {
          tenantId: this.tenantId(),
          chamadoId: dto.chamadoId,
          origem: 'cidadao',
          storageKey: '(via media_asset)',
          mediaAssetId: asset.id,
        } as any,
      });
    }
    return { id: asset.id, enviado: true };
  }

  // -------------------------------------------------------------- listagem
  async list(filtros: { tipo?: string; categoria?: string; q?: string; page?: number }) {
    const page = Math.max(1, filtros.page ?? 1);
    const take = 40;
    const where: any = { visibilidade: 'publico' }; // galeria admin lista o acervo do portal
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
    const head = file.buffer.subarray(0, 256).toString('utf8').trimStart();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
      return 'image/svg+xml';
    }
    const { fileTypeFromBuffer } = await import('file-type');
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
