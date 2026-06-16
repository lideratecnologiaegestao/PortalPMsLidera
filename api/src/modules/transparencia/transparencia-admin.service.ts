import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarDocumentoDto, AtualizarDocumentoDto } from './transparencia-admin.dto';

@Injectable()
export class TransparenciaAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------- sync-log
  async listarSyncLog(opts: {
    dataset?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.dataset) where.dataset = opts.dataset;

    const [raw, total] = await Promise.all([
      this.prisma.db.transpSyncLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          dataset: true,
          origem: true,
          registros: true,
          status: true,
          criadoEm: true,
        },
      }),
      this.prisma.db.transpSyncLog.count({ where }),
    ]);

    // BigInt não é serializável diretamente em JSON — converte para string
    const items = raw.map((r) => ({ ...r, id: String(r.id) }));
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  // -------------------------------------------------------- documentos
  async listarDocumentos(opts: {
    categoria?: string;
    exercicio?: number;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.categoria) where.categoria = opts.categoria;
    if (opts.exercicio) where.exercicio = opts.exercicio;

    const [items, total] = await Promise.all([
      this.prisma.db.transpDocumento.findMany({
        where,
        orderBy: [{ exercicio: 'desc' }, { publicadoEm: 'desc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.transpDocumento.count({ where }),
    ]);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async criarDocumento(dto: CriarDocumentoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    const doc = await this.prisma.db.transpDocumento.create({
      data: {
        tenantId,
        categoria: dto.categoria,
        exercicio: dto.exercicio,
        periodo: dto.periodo,
        titulo: dto.titulo,
        urlExterna: dto.urlExterna,
        storageKey: dto.storageKey,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'TRANSP_DOCUMENTO_CRIADO',
        entidade: 'transp_documentos',
        entidadeId: doc.id,
        dados: { categoria: doc.categoria, titulo: doc.titulo },
      },
    });

    return doc;
  }

  async atualizarDocumento(
    id: string,
    dto: AtualizarDocumentoDto,
    atorId?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const existente = await this.prisma.db.transpDocumento.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existente) throw new NotFoundException('Documento não encontrado.');

    const data: Record<string, unknown> = {};
    if (dto.categoria !== undefined) data.categoria = dto.categoria;
    if (dto.exercicio !== undefined) data.exercicio = dto.exercicio;
    if (dto.periodo !== undefined) data.periodo = dto.periodo;
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.urlExterna !== undefined) data.urlExterna = dto.urlExterna;
    if (dto.storageKey !== undefined) data.storageKey = dto.storageKey;

    const atualizado = await this.prisma.db.transpDocumento.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'TRANSP_DOCUMENTO_ATUALIZADO',
        entidade: 'transp_documentos',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizado;
  }

  async excluirDocumento(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const doc = await this.prisma.db.transpDocumento.findUnique({
      where: { id },
      select: { id: true, titulo: true, categoria: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    await this.prisma.db.transpDocumento.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'TRANSP_DOCUMENTO_EXCLUIDO',
        entidade: 'transp_documentos',
        entidadeId: id,
        dados: { titulo: doc.titulo, categoria: doc.categoria },
      },
    });

    return { excluido: true };
  }
}
