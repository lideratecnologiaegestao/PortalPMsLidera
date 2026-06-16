import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

export interface PopupDto {
  titulo?: string;
  tipo?: string; // imagem | video | youtube | html
  imagemUrl?: string;
  linkUrl?: string;
  youtube?: string;
  videoUrl?: string;
  conteudoHtml?: string;
  pagina?: string;
  mostrarTitulo?: boolean;
  ativo?: boolean;
  inicioEm?: string | null;
  fimEm?: string | null;
  frequenciaHoras?: number;
  ordem?: number;
}

const TIPOS = ['imagem', 'video', 'youtube', 'html'];

@Injectable()
export class PopupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Popups ativos e dentro da janela de datas, para uma página (rota). */
  async listarPublicos(pagina?: string) {
    const agora = new Date();
    const popups = await this.prisma.db.popup.findMany({
      where: {
        ativo: true,
        AND: [
          { OR: [{ inicioEm: null }, { inicioEm: { lte: agora } }] },
          { OR: [{ fimEm: null }, { fimEm: { gte: agora } }] },
          pagina ? { OR: [{ pagina: null }, { pagina: '' }, { pagina }] } : {},
        ],
      },
      orderBy: { ordem: 'asc' },
      select: {
        id: true, titulo: true, tipo: true, imagemUrl: true, linkUrl: true,
        youtube: true, videoUrl: true, conteudoHtml: true, pagina: true,
        mostrarTitulo: true, frequenciaHoras: true,
      },
    });
    return popups;
  }

  listarAdmin() {
    return this.prisma.db.popup.findMany({ orderBy: { ordem: 'asc' } });
  }

  criar(dto: PopupDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.popup.create({ data: this.montar(dto, tenantId) });
  }

  async atualizar(id: string, dto: PopupDto) {
    await this.achar(id);
    return this.prisma.db.popup.update({ where: { id }, data: this.montarParcial(dto) });
  }

  async excluir(id: string) {
    await this.achar(id);
    await this.prisma.db.popup.delete({ where: { id } });
    return { excluido: true };
  }

  private async achar(id: string) {
    const p = await this.prisma.db.popup.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Popup não encontrado.');
    return p;
  }

  private montar(dto: PopupDto, tenantId: string) {
    return {
      tenantId,
      titulo: dto.titulo?.trim() || null,
      tipo: TIPOS.includes(dto.tipo ?? '') ? dto.tipo! : 'imagem',
      imagemUrl: dto.imagemUrl?.trim() || null,
      linkUrl: dto.linkUrl?.trim() || null,
      youtube: dto.youtube?.trim() || null,
      videoUrl: dto.videoUrl?.trim() || null,
      conteudoHtml: dto.conteudoHtml ?? null,
      pagina: dto.pagina?.trim() || null,
      mostrarTitulo: dto.mostrarTitulo ?? true,
      ativo: dto.ativo ?? true,
      inicioEm: dto.inicioEm ? new Date(dto.inicioEm) : null,
      fimEm: dto.fimEm ? new Date(dto.fimEm) : null,
      frequenciaHoras: Math.max(0, Number(dto.frequenciaHoras ?? 24)),
      ordem: dto.ordem ?? 0,
    };
  }

  private montarParcial(dto: PopupDto) {
    const d: Record<string, unknown> = {};
    if (dto.titulo !== undefined) d.titulo = dto.titulo?.trim() || null;
    if (dto.tipo !== undefined) d.tipo = TIPOS.includes(dto.tipo ?? '') ? dto.tipo : 'imagem';
    if (dto.imagemUrl !== undefined) d.imagemUrl = dto.imagemUrl?.trim() || null;
    if (dto.linkUrl !== undefined) d.linkUrl = dto.linkUrl?.trim() || null;
    if (dto.youtube !== undefined) d.youtube = dto.youtube?.trim() || null;
    if (dto.videoUrl !== undefined) d.videoUrl = dto.videoUrl?.trim() || null;
    if (dto.conteudoHtml !== undefined) d.conteudoHtml = dto.conteudoHtml ?? null;
    if (dto.pagina !== undefined) d.pagina = dto.pagina?.trim() || null;
    if (dto.mostrarTitulo !== undefined) d.mostrarTitulo = dto.mostrarTitulo;
    if (dto.ativo !== undefined) d.ativo = dto.ativo;
    if (dto.inicioEm !== undefined) d.inicioEm = dto.inicioEm ? new Date(dto.inicioEm) : null;
    if (dto.fimEm !== undefined) d.fimEm = dto.fimEm ? new Date(dto.fimEm) : null;
    if (dto.frequenciaHoras !== undefined) d.frequenciaHoras = Math.max(0, Number(dto.frequenciaHoras));
    if (dto.ordem !== undefined) d.ordem = dto.ordem ?? 0;
    return d;
  }
}
