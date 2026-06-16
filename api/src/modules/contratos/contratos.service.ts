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
 * Cadastro de Contratos e Aditivos (dimensão PNTP). Cada contrato pode vincular
 * à licitação de origem e ter aditivos, com contador de downloads no contrato e
 * em cada aditivo. RLS por tenant; seeding cross-tenant só cria o menu.
 */
@Injectable()
export class ContratosService {
  private readonly log = new Logger(ContratosService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  async semearTenant(tenantId: string): Promise<{ seeded: boolean }> {
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', 'Documentos Oficiais', 'documentos_root');
    await this.menus.criarItemAuto(tenantId, {
      local: 'cabecalho', parentId: grupoId, label: 'Contratos', tipo: 'interno',
      href: '/contratos', icone: 'file', refTipo: 'contratos_menu', refId: tenantId,
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
      where.OR = [{ objeto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }, { contratado: { contains: q, mode: 'insensitive' } }];
    }
    return this.prisma.db.contrato.findMany({
      where, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { id: true, slug: true, numero: true, ano: true, objeto: true, contratado: true, valor: true, situacao: true, vigenciaFim: true, _count: { select: { aditivos: true } } },
    });
  }

  async porSlug(slug: string) {
    const c = await this.prisma.db.contrato.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, numero: true, ano: true, objeto: true, contratado: true, contratadoDoc: true, valor: true,
        dataAssinatura: true, vigenciaInicio: true, vigenciaFim: true, situacao: true, orgao: true, fundamento: true,
        arquivoUrl: true, downloads: true,
        aditivos: { orderBy: { ordem: 'asc' }, select: { id: true, numero: true, tipo: true, objeto: true, valor: true, data: true, vigenciaFim: true, arquivoUrl: true, downloads: true } },
      },
    });
    if (!c) throw new NotFoundException('Contrato não encontrado.');
    return c;
  }

  async exportar() {
    const items = await this.prisma.db.contrato.findMany({
      where: { ativo: true }, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { numero: true, ano: true, objeto: true, contratado: true, contratadoDoc: true, valor: true, situacao: true, vigenciaInicio: true, vigenciaFim: true, orgao: true, _count: { select: { aditivos: true } } },
    });
    return items.map((c) => ({
      numero: c.numero ?? '', ano: c.ano ?? '', objeto: c.objeto, contratado: c.contratado ?? '', documento: c.contratadoDoc ?? '',
      valor: c.valor ?? '', situacao: c.situacao ?? '', vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, orgao: c.orgao ?? '', aditivos: c._count.aditivos,
    }));
  }

  async registrarDownload(id: string): Promise<string> {
    return this.incrementar('contrato', id);
  }
  async registrarDownloadAditivo(id: string): Promise<string> {
    return this.incrementar('aditivo', id);
  }
  private async incrementar(tipo: 'contrato' | 'aditivo', id: string): Promise<string> {
    try {
      const r = tipo === 'contrato'
        ? await this.prisma.db.contrato.update({ where: { id }, data: { downloads: { increment: 1 } }, select: { arquivoUrl: true } })
        : await this.prisma.db.contratoAditivo.update({ where: { id }, data: { downloads: { increment: 1 } }, select: { arquivoUrl: true } });
      if (!r.arquivoUrl) throw new NotFoundException('Sem arquivo.');
      return r.arquivoUrl;
    } catch {
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ── admin ──
  listarAdmin() {
    return this.prisma.db.contrato.findMany({
      orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { id: true, numero: true, ano: true, objeto: true, contratado: true, situacao: true, ativo: true, _count: { select: { aditivos: true } } },
    });
  }
  /** Licitações para o seletor opcional de origem. */
  listarLicitacoes() {
    return this.prisma.db.licitacao.findMany({ orderBy: [{ ano: 'desc' }], take: 200, select: { id: true, numero: true, ano: true, objeto: true } });
  }
  obter(id: string) {
    return this.prisma.db.contrato.findUniqueOrThrow({ where: { id }, include: { aditivos: { orderBy: { ordem: 'asc' } } } }).catch(() => { throw new NotFoundException('Contrato não encontrado.'); });
  }
  async criar(dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const base = dto.numero ? `${dto.numero}-${dto.ano ?? ''}` : dto.objeto;
    const slug = await this.slugUnico(slugify(base) || 'contrato', tenantId);
    const c = await this.prisma.db.contrato.create({
      data: {
        tenantId, slug, licitacaoId: dto.licitacaoId || null, numero: dto.numero || null, ano: dto.ano ?? null,
        objeto: dto.objeto, contratado: dto.contratado || null, contratadoDoc: dto.contratadoDoc || null,
        valor: dto.valor != null ? dto.valor : null, situacao: dto.situacao || null, orgao: dto.orgao || null, fundamento: dto.fundamento || null,
        arquivoUrl: dto.arquivoUrl || null,
        dataAssinatura: dto.dataAssinatura ? new Date(dto.dataAssinatura) : null,
        vigenciaInicio: dto.vigenciaInicio ? new Date(dto.vigenciaInicio) : null,
        vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : null,
      },
    });
    await this.audit(tenantId, atorId, 'CONTRATO_CRIADO', c.id, { slug });
    this.buscaSync.enqueue('contrato', c.id).catch(() => undefined);
    return c;
  }
  async atualizar(id: string, dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    for (const k of ['licitacaoId', 'numero', 'ano', 'objeto', 'contratado', 'contratadoDoc', 'valor', 'situacao', 'orgao', 'fundamento', 'arquivoUrl', 'ativo'] as const) {
      if (dto[k] !== undefined) data[k] = k === 'licitacaoId' ? (dto[k] || null) : dto[k];
    }
    for (const k of ['dataAssinatura', 'vigenciaInicio', 'vigenciaFim'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k] ? new Date(dto[k]) : null;
    }
    const c = await this.prisma.db.contrato.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'CONTRATO_ATUALIZADO', id, {});
    this.buscaSync.enqueue('contrato', id).catch(() => undefined);
    return c;
  }
  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.contrato.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'CONTRATO_EXCLUIDO', id, {});
    this.buscaSync.enqueue('contrato', id).catch(() => undefined);
    return { excluido: true };
  }
  async addAditivo(contratoId: string, dto: any) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.contratoAditivo.create({
      data: {
        tenantId, contratoId, numero: dto.numero || null, tipo: dto.tipo || null, objeto: dto.objeto || null,
        valor: dto.valor != null ? dto.valor : null, arquivoUrl: dto.arquivoUrl || null,
        data: dto.data ? new Date(dto.data) : null, vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : null, ordem: dto.ordem ?? 0,
      },
    });
  }
  excluirAditivo(id: string) {
    return this.prisma.db.contratoAditivo.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  private async slugUnico(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().contrato.findFirst({ where: { tenantId, slug }, select: { id: true } })) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }
  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidadeId: string, dados: any) {
    try { await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade: 'contratos', entidadeId, dados } }); }
    catch (e) { this.log.warn(`audit ${acao}: ${(e as Error).message}`); }
  }
}
