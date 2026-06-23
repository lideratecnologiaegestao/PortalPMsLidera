import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Lista itens da galeria do tenant (compartilhada). Filtra por tipo opcional.
   *
   * Modo sem paginação (retrocompat portal web): omita page/pageSize → retorna array.
   * Modo paginado (app mobile): informe page + pageSize → retorna { items, total, page, pageSize }.
   */
  async listarPublica(tipo?: string, page?: number, pageSize?: number) {
    const where: Record<string, unknown> = {};
    if (tipo === 'foto' || tipo === 'video') where.tipo = tipo;

    // Modo paginado (app mobile)
    if (page !== undefined || pageSize !== undefined) {
      const p = Math.max(1, page ?? 1);
      const ps = Math.min(100, Math.max(1, pageSize ?? 24));
      const [items, total] = await Promise.all([
        this.prisma.db.galeriaItem.findMany({
          where,
          orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
          skip: (p - 1) * ps,
          take: ps,
          select: { ...SELECT_PUBLICO, secretaria: { select: { nome: true, slug: true } } },
        }),
        this.prisma.db.galeriaItem.count({ where }),
      ]);
      return { items, total, page: p, pageSize: ps };
    }

    // Modo sem paginação (retrocompat — portal web usa esta forma)
    return this.prisma.db.galeriaItem.findMany({
      where,
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      select: { ...SELECT_PUBLICO, secretaria: { select: { nome: true, slug: true } } },
    });
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: {
    page: number;
    pageSize: number;
    tipo?: string;
    /** undefined = sem escopo; null = sem lotação → lista vazia; string = uuid */
    escopoSecretariaId?: string | null;
  }) {
    // Escopo null = gestor/servidor sem lotação → lista vazia
    if (opts.escopoSecretariaId === null) {
      return { items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
    }

    const where: Record<string, unknown> = {};
    if (opts.escopoSecretariaId !== undefined) where.secretariaId = opts.escopoSecretariaId;
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

  async criar(dto: CriarGaleriaDto, escopoSecretariaId?: string | null) {
    // Escopo null = gestor/servidor sem lotação → 403
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }

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

    // Escopo uuid = força secretariaId; undefined = respeita dto
    const secretariaId = escopoSecretariaId !== undefined
      ? escopoSecretariaId
      : (dto.secretariaId || null);

    return this.prisma.db.galeriaItem.create({
      data: {
        tenantId,
        secretariaId,
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

  async atualizar(id: string, dto: AtualizarGaleriaDto, escopoSecretariaId?: string | null) {
    const item = await this.buscar(id, escopoSecretariaId);
    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    if (dto.secretariaId !== undefined) {
      // Escopo uuid: não pode mover item para fora da sua secretaria
      if (escopoSecretariaId !== undefined && dto.secretariaId !== escopoSecretariaId) {
        throw new ForbiddenException('Não é permitido alterar a secretaria para fora do seu escopo.');
      }
      data.secretariaId = dto.secretariaId || null;
    }
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
    // Suprime aviso de variável não utilizada (item foi verificado por buscar())
    void item;
    return this.prisma.db.galeriaItem.update({
      where: { id },
      data,
      select: { ...SELECT_PUBLICO, criadoEm: true },
    });
  }

  async buscar(id: string, escopoSecretariaId?: string | null) {
    const item = await this.prisma.db.galeriaItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item de galeria não encontrado.');
    // Escopo null = sem lotação
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }
    // Escopo uuid = só pode acessar itens da sua secretaria
    if (escopoSecretariaId !== undefined && item.secretariaId !== escopoSecretariaId) {
      throw new ForbiddenException('Acesso negado: item pertence a outra secretaria.');
    }
    return item;
  }

  async excluir(id: string, escopoSecretariaId?: string | null) {
    await this.buscar(id, escopoSecretariaId);
    await this.prisma.db.galeriaItem.delete({ where: { id } });
    return { excluido: true };
  }
}
