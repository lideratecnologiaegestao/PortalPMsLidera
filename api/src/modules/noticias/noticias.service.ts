import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarNoticiaDto, AtualizarNoticiaDto } from './noticias.dto';
import { BuscaSyncService } from '../busca/busca-sync.service';

@Injectable()
export class NoticiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ---------------------------------------------------------------- público
  /** Lista notícias publicadas, paginadas, filtradas por categoria e/ou texto. */
  async listarPublicas(opts: {
    categoria?: string;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = { publicado: true };
    if (opts.categoria) where.categoria = opts.categoria;
    if (opts.q) {
      where.titulo = { contains: opts.q, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.noticia.findMany({
        where,
        orderBy: { publicadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          slug: true,
          titulo: true,
          resumo: true,
          imagemUrl: true,
          categoria: true,
          autor: true,
          publicadoEm: true,
          visualizacoes: true,
        },
      }),
      this.prisma.db.noticia.count({ where }),
    ]);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /** Busca notícia publicada por slug; incrementa visualizações. */
  async porSlugPublico(slug: string) {
    const noticia = await this.prisma.db.noticia.findFirst({
      where: { slug, publicado: true },
    });
    if (!noticia) throw new NotFoundException(`Notícia "${slug}" não encontrada.`);

    // Incrementa visualizações de forma fire-and-forget (não bloqueia a resposta)
    this.prisma.db.noticia
      .update({
        where: { id: noticia.id },
        data: { visualizacoes: { increment: 1 } },
      })
      .catch(() => {
        // Falha silenciosa — contagem de views não é crítica
      });

    return noticia;
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: {
    categoria?: string;
    publicado?: boolean;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.categoria) where.categoria = opts.categoria;
    if (opts.publicado !== undefined) where.publicado = opts.publicado;
    if (opts.q) {
      where.titulo = { contains: opts.q, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.noticia.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.noticia.count({ where }),
    ]);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscarAdmin(id: string) {
    const noticia = await this.prisma.db.noticia.findUnique({ where: { id } });
    if (!noticia) throw new NotFoundException('Notícia não encontrada.');
    return noticia;
  }

  async criar(dto: CriarNoticiaDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // Verifica slug duplicado dentro do tenant
    const existente = await this.prisma.db.noticia.findUnique({
      where: { tenantId_slug: { tenantId, slug: dto.slug } },
    });
    if (existente) {
      throw new ConflictException(`Já existe uma notícia com o slug "${dto.slug}".`);
    }

    const agora = new Date();
    const publicado = dto.publicado ?? false;

    const noticia = await this.prisma.db.noticia.create({
      data: {
        tenantId,
        slug: dto.slug,
        titulo: dto.titulo,
        resumo: dto.resumo,
        conteudo: dto.conteudo,
        imagemUrl: dto.imagemUrl,
        categoria: dto.categoria,
        autor: dto.autor,
        fonte: dto.fonte,
        legenda: dto.legenda,
        credito: dto.credito,
        encerraEm: dto.encerraEm ? new Date(dto.encerraEm) : null,
        secretariaId: dto.secretariaId || null,
        publicado,
        // Se está publicando de imediato, define publicadoEm
        publicadoEm: publicado ? agora : undefined,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'NOTICIA_CRIADA',
        entidade: 'noticias',
        entidadeId: noticia.id,
        dados: { slug: noticia.slug, titulo: noticia.titulo, publicado },
      },
    });

    // Enfileira indexação no buscador unificado (fire-and-forget)
    this.buscaSync.enqueue('noticia', noticia.id).catch(() => undefined);

    return noticia;
  }

  async atualizar(id: string, dto: AtualizarNoticiaDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const atual = await this.buscarAdmin(id);

    // Se mudou o slug, verifica duplicata
    if (dto.slug && dto.slug !== atual.slug) {
      const existente = await this.prisma.db.noticia.findUnique({
        where: { tenantId_slug: { tenantId, slug: dto.slug } },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException(`Já existe uma notícia com o slug "${dto.slug}".`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.resumo !== undefined) data.resumo = dto.resumo;
    if (dto.conteudo !== undefined) data.conteudo = dto.conteudo;
    if (dto.imagemUrl !== undefined) data.imagemUrl = dto.imagemUrl;
    if (dto.categoria !== undefined) data.categoria = dto.categoria;
    if (dto.autor !== undefined) data.autor = dto.autor;
    if (dto.fonte !== undefined) data.fonte = dto.fonte;
    if (dto.legenda !== undefined) data.legenda = dto.legenda;
    if (dto.credito !== undefined) data.credito = dto.credito;
    if (dto.encerraEm !== undefined) data.encerraEm = dto.encerraEm ? new Date(dto.encerraEm) : null;
    if (dto.secretariaId !== undefined) data.secretariaId = dto.secretariaId || null;
    if (dto.publicado !== undefined) {
      data.publicado = dto.publicado;
      // Seta publicadoEm na primeira publicação
      if (dto.publicado && !atual.publicadoEm) {
        data.publicadoEm = new Date();
      }
    }

    const atualizado = await this.prisma.db.noticia.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'NOTICIA_ATUALIZADA',
        entidade: 'noticias',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    // Enfileira re-indexação (visibilidade pode ter mudado)
    this.buscaSync.enqueue('noticia', id).catch(() => undefined);

    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const noticia = await this.buscarAdmin(id);

    await this.prisma.db.noticia.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'NOTICIA_EXCLUIDA',
        entidade: 'noticias',
        entidadeId: id,
        dados: { slug: noticia.slug, titulo: noticia.titulo },
      },
    });

    // Remove do índice (notícia excluída não deve aparecer na busca)
    this.buscaSync.enqueue('noticia', id).catch(() => undefined);

    return { excluido: true };
  }
}
