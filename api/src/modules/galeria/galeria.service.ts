import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarGaleriaDto, AtualizarGaleriaDto } from './galeria.dto';

/**
 * Extrai o ID de 11 caracteres de um vídeo do YouTube a partir das formas
 * comuns de URL (watch?v=, youtu.be/, embed/, shorts/) ou de um ID cru.
 * Retorna null se não reconhecer.
 */
export function extrairYoutubeId(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  // ID cru
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

const SELECT_PUBLICO = {
  id: true,
  tipo: true,
  fonte: true,
  titulo: true,
  url: true,
  youtubeId: true,
  ordem: true,
  secretariaId: true,
} as const;

@Injectable()
export class GaleriaService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- público
  /** Lista itens da galeria do tenant (compartilhada). Filtra por tipo opcional. */
  async listarPublica(tipo?: string) {
    const where: Record<string, unknown> = {};
    if (tipo === 'foto' || tipo === 'video') where.tipo = tipo;
    return this.prisma.db.galeriaItem.findMany({
      where,
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      select: { ...SELECT_PUBLICO, secretaria: { select: { nome: true, slug: true } } },
    });
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: { page: number; pageSize: number; tipo?: string }) {
    const where: Record<string, unknown> = {};
    if (opts.tipo === 'foto' || opts.tipo === 'video') where.tipo = opts.tipo;
    const [items, total] = await Promise.all([
      this.prisma.db.galeriaItem.findMany({
        where,
        orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: { ...SELECT_PUBLICO, criadoEm: true, secretaria: { select: { nome: true } } },
      }),
      this.prisma.db.galeriaItem.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async criar(dto: CriarGaleriaDto) {
    const tenantId = TenantContext.tenantId()!;
    const tipo = ['video', 'audio'].includes(dto.tipo) ? dto.tipo : 'foto';
    let fonte = 'upload';
    let url: string | null = dto.url || null;
    let youtubeId: string | null = null;

    if (tipo === 'video' && dto.youtube) {
      const yid = extrairYoutubeId(dto.youtube);
      if (yid) {
        fonte = 'youtube';
        youtubeId = yid;
        url = null;
      }
    }

    return this.prisma.db.galeriaItem.create({
      data: {
        tenantId,
        secretariaId: dto.secretariaId || null,
        tipo,
        fonte,
        titulo: dto.titulo || null,
        url,
        youtubeId,
        ordem: dto.ordem ?? 0,
      },
      select: { ...SELECT_PUBLICO, criadoEm: true },
    });
  }

  async atualizar(id: string, dto: AtualizarGaleriaDto) {
    await this.buscar(id);
    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    if (dto.secretariaId !== undefined) data.secretariaId = dto.secretariaId || null;
    if (dto.tipo !== undefined) data.tipo = ['video', 'audio'].includes(dto.tipo) ? dto.tipo : 'foto';
    if (dto.url !== undefined) {
      data.url = dto.url || null;
      data.fonte = 'upload';
      data.youtubeId = null;
    }
    if (dto.youtube !== undefined) {
      const yid = extrairYoutubeId(dto.youtube);
      if (yid) {
        data.youtubeId = yid;
        data.fonte = 'youtube';
        data.url = null;
        data.tipo = 'video';
      }
    }
    return this.prisma.db.galeriaItem.update({
      where: { id },
      data,
      select: { ...SELECT_PUBLICO, criadoEm: true },
    });
  }

  async buscar(id: string) {
    const item = await this.prisma.db.galeriaItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item de galeria não encontrado.');
    return item;
  }

  async excluir(id: string) {
    await this.buscar(id);
    await this.prisma.db.galeriaItem.delete({ where: { id } });
    return { excluido: true };
  }
}
