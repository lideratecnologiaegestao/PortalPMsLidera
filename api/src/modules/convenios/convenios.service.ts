import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { BuscaSyncService } from '../busca/busca-sync.service';

function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Cadastro de Convênios e Transferências (dimensão PNTP). Cada convênio tem
 * partes, valores, vigência e documentos (termo, plano de trabalho, prestação de
 * contas…), cada documento com contador de downloads. RLS por tenant.
 */
@Injectable()
export class ConveniosService {
  private readonly log = new Logger(ConveniosService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  async semearTenant(tenantId: string): Promise<{ seeded: boolean }> {
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', 'Documentos Oficiais', 'documentos_root');
    await this.menus.criarItemAuto(tenantId, {
      local: 'cabecalho', parentId: grupoId, label: 'Convênios', tipo: 'interno',
      href: '/convenios', icone: 'file', refTipo: 'convenios_menu', refId: tenantId,
    });
    return { seeded: true };
  }

  // ── público ──
  async listarPublico(p: { ano?: number; situacao?: string; q?: string }) {
    const where: any = { ativo: true };
    if (p.ano) where.ano = p.ano;
    if (p.situacao) where.situacao = p.situacao;
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      where.OR = [{ objeto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }, { convenente: { contains: q, mode: 'insensitive' } }, { concedente: { contains: q, mode: 'insensitive' } }];
    }
    return this.prisma.db.convenio.findMany({
      where, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { id: true, slug: true, numero: true, ano: true, objeto: true, concedente: true, convenente: true, valorRepasse: true, situacao: true, vigenciaFim: true, _count: { select: { documentos: true } } },
    });
  }

  async porSlug(slug: string) {
    const c = await this.prisma.db.convenio.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, numero: true, ano: true, objeto: true, concedente: true, convenente: true, valorRepasse: true, contrapartida: true,
        dataAssinatura: true, vigenciaInicio: true, vigenciaFim: true, situacao: true, orgao: true,
        documentos: { orderBy: { ordem: 'asc' }, select: { id: true, categoria: true, titulo: true, dataDocumento: true, arquivoUrl: true, downloads: true } },
      },
    });
    if (!c) throw new NotFoundException('Convênio não encontrado.');
    return c;
  }

  async exportar() {
    const items = await this.prisma.db.convenio.findMany({
      where: { ativo: true }, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { numero: true, ano: true, objeto: true, concedente: true, convenente: true, valorRepasse: true, contrapartida: true, situacao: true, vigenciaInicio: true, vigenciaFim: true, orgao: true, _count: { select: { documentos: true } } },
    });
    return items.map((c) => ({
      numero: c.numero ?? '', ano: c.ano ?? '', objeto: c.objeto, concedente: c.concedente ?? '', convenente: c.convenente ?? '',
      valorRepasse: c.valorRepasse ?? '', contrapartida: c.contrapartida ?? '', situacao: c.situacao ?? '', vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, orgao: c.orgao ?? '', documentos: c._count.documentos,
    }));
  }

  async registrarDownload(docId: string): Promise<string> {
    try {
      const d = await this.prisma.db.convenioDocumento.update({ where: { id: docId }, data: { downloads: { increment: 1 } }, select: { arquivoUrl: true } });
      if (!d.arquivoUrl) throw new NotFoundException('Sem arquivo.');
      return d.arquivoUrl;
    } catch {
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ── admin ──
  listarAdmin() {
    return this.prisma.db.convenio.findMany({
      orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { id: true, numero: true, ano: true, objeto: true, convenente: true, situacao: true, ativo: true, _count: { select: { documentos: true } } },
    });
  }
  obter(id: string) {
    return this.prisma.db.convenio.findUniqueOrThrow({ where: { id }, include: { documentos: { orderBy: { ordem: 'asc' } } } }).catch(() => { throw new NotFoundException('Convênio não encontrado.'); });
  }
  async criar(dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const base = dto.numero ? `${dto.numero}-${dto.ano ?? ''}` : dto.objeto;
    const slug = await this.slugUnico(slugify(base) || 'convenio', tenantId);
    const c = await this.prisma.db.convenio.create({
      data: {
        tenantId, slug, numero: dto.numero || null, ano: dto.ano ?? null, objeto: dto.objeto,
        concedente: dto.concedente || null, convenente: dto.convenente || null,
        valorRepasse: dto.valorRepasse != null ? dto.valorRepasse : null, contrapartida: dto.contrapartida != null ? dto.contrapartida : null,
        situacao: dto.situacao || null, orgao: dto.orgao || null,
        dataAssinatura: dto.dataAssinatura ? new Date(dto.dataAssinatura) : null,
        vigenciaInicio: dto.vigenciaInicio ? new Date(dto.vigenciaInicio) : null,
        vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : null,
      },
    });
    await this.audit(tenantId, atorId, 'CONVENIO_CRIADO', c.id, { slug });
    this.buscaSync.enqueue('convenio', c.id).catch(() => undefined);
    return c;
  }
  async atualizar(id: string, dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    for (const k of ['numero', 'ano', 'objeto', 'concedente', 'convenente', 'valorRepasse', 'contrapartida', 'situacao', 'orgao', 'ativo'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    for (const k of ['dataAssinatura', 'vigenciaInicio', 'vigenciaFim'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k] ? new Date(dto[k]) : null;
    }
    const c = await this.prisma.db.convenio.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'CONVENIO_ATUALIZADO', id, {});
    this.buscaSync.enqueue('convenio', id).catch(() => undefined);
    return c;
  }
  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.convenio.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'CONVENIO_EXCLUIDO', id, {});
    this.buscaSync.enqueue('convenio', id).catch(() => undefined);
    return { excluido: true };
  }
  async addDocumento(convenioId: string, dto: any) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.convenioDocumento.create({
      data: { tenantId, convenioId, categoria: dto.categoria, titulo: dto.titulo, arquivoUrl: dto.arquivoUrl || null, dataDocumento: dto.dataDocumento ? new Date(dto.dataDocumento) : null, ordem: dto.ordem ?? 0 },
    });
  }
  excluirDocumento(id: string) {
    return this.prisma.db.convenioDocumento.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  private async slugUnico(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().convenio.findFirst({ where: { tenantId, slug }, select: { id: true } })) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }
  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidadeId: string, dados: any) {
    try { await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade: 'convenios', entidadeId, dados } }); }
    catch (e) { this.log.warn(`audit ${acao}: ${(e as Error).message}`); }
  }
}
