import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarBannerDto, AtualizarBannerDto } from './banners.dto';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- público
  /** Lista banners ativos e dentro da janela de datas, ordenados por `ordem`. */
  async listarAtivos() {
    const agora = new Date();
    return this.prisma.db.banner.findMany({
      where: {
        ativo: true,
        AND: [
          { OR: [{ inicioEm: null }, { inicioEm: { lte: agora } }] },
          { OR: [{ fimEm: null }, { fimEm: { gte: agora } }] },
        ],
      },
      orderBy: { ordem: 'asc' },
    });
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.prisma.db.banner.findMany({
        orderBy: { ordem: 'asc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.banner.count(),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscar(id: string) {
    const banner = await this.prisma.db.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner não encontrado.');
    return banner;
  }

  async criar(dto: CriarBannerDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const banner = await this.prisma.db.banner.create({
      data: {
        tenantId,
        titulo: dto.titulo,
        subtitulo: dto.subtitulo,
        imagemUrl: dto.imagemUrl,
        linkUrl: dto.linkUrl,
        ctaLabel: dto.ctaLabel,
        conteudoHtml: dto.conteudoHtml,
        inicioEm: dto.inicioEm ? new Date(dto.inicioEm) : null,
        fimEm: dto.fimEm ? new Date(dto.fimEm) : null,
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'BANNER_CRIADO',
        entidade: 'banners',
        entidadeId: banner.id,
        dados: { titulo: banner.titulo, ordem: banner.ordem },
      },
    });

    return banner;
  }

  async atualizar(id: string, dto: AtualizarBannerDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(id); // garante existência no tenant via RLS

    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.subtitulo !== undefined) data.subtitulo = dto.subtitulo;
    if (dto.imagemUrl !== undefined) data.imagemUrl = dto.imagemUrl;
    if (dto.linkUrl !== undefined) data.linkUrl = dto.linkUrl;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel;
    if (dto.conteudoHtml !== undefined) data.conteudoHtml = dto.conteudoHtml;
    if (dto.inicioEm !== undefined) data.inicioEm = dto.inicioEm ? new Date(dto.inicioEm) : null;
    if (dto.fimEm !== undefined) data.fimEm = dto.fimEm ? new Date(dto.fimEm) : null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const atualizado = await this.prisma.db.banner.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'BANNER_ATUALIZADO',
        entidade: 'banners',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const banner = await this.buscar(id);

    await this.prisma.db.banner.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'BANNER_EXCLUIDO',
        entidade: 'banners',
        entidadeId: id,
        dados: { titulo: banner.titulo },
      },
    });

    return { excluido: true };
  }
}
