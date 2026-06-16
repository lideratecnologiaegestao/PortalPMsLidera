import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { MODALIDADES, CRITERIOS } from './seeds-licitacao';
import { BuscaSyncService } from '../busca/busca-sync.service';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cadastro de Licitações (Fase 2). Cada licitação tem modalidade + critério de
 * julgamento (taxonomias TCE-MT) e vários documentos por fase, cada um com
 * contador de downloads. RLS por tenant; seeding cross-tenant (platform()).
 */
@Injectable()
export class LicitacoesService {
  private readonly log = new Logger(LicitacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ───────────────────────────── seeding ───────────────────────────────────
  async semearTenant(tenantId: string): Promise<{ seeded: boolean }> {
    const db = this.prisma.platform();
    const jaTem = await db.licitacaoModalidade.findFirst({ where: { tenantId }, select: { id: true } });
    if (jaTem) return { seeded: false };
    await db.licitacaoModalidade.createMany({ data: MODALIDADES.map((m) => ({ tenantId, ...m })) });
    await db.licitacaoCriterio.createMany({ data: CRITERIOS.map((c) => ({ tenantId, ...c })) });
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', 'Documentos Oficiais', 'documentos_root');
    await this.menus.criarItemAuto(tenantId, {
      local: 'cabecalho', parentId: grupoId, label: 'Licitações', tipo: 'interno',
      href: '/licitacoes', icone: 'gavel', refTipo: 'licitacoes_menu', refId: tenantId,
    });
    return { seeded: true };
  }

  // ───────────────────────────── público ───────────────────────────────────
  async listarPublico(p: { modalidade?: string; ano?: number; situacao?: string; q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, p.pageSize ?? 20));
    const where: any = { ativo: true };
    if (p.ano) where.ano = p.ano;
    if (p.situacao) where.situacao = p.situacao;
    if (p.modalidade) {
      const m = await this.prisma.db.licitacaoModalidade.findFirst({ where: { slug: p.modalidade }, select: { id: true } });
      where.modalidadeId = m?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      where.OR = [{ objeto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }];
    }
    const [total, items] = await Promise.all([
      this.prisma.db.licitacao.count({ where }),
      this.prisma.db.licitacao.findMany({
        where,
        orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, slug: true, numero: true, ano: true, objeto: true, situacao: true, orgao: true, dataAbertura: true,
          modalidade: { select: { nome: true, lei8666: true, lei14133: true } },
          criterio: { select: { nome: true } },
          _count: { select: { documentos: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async porSlug(slug: string) {
    const lic = await this.prisma.db.licitacao.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, numero: true, ano: true, objeto: true, situacao: true, orgao: true, dataAbertura: true, valorEstimado: true,
        modalidade: { select: { nome: true, lei8666: true, lei14133: true } },
        criterio: { select: { nome: true } },
        documentos: {
          orderBy: { ordem: 'asc' },
          select: { id: true, fase: true, titulo: true, arquivoUrl: true, downloads: true },
        },
      },
    });
    if (!lic) throw new NotFoundException('Licitação não encontrada.');
    return lic;
  }

  /** Modalidades efetivamente usadas (filtro público enxuto). */
  modalidadesEmUso() {
    return this.prisma.db.licitacaoModalidade.findMany({
      where: { licitacoes: { some: { ativo: true } } },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true },
    });
  }

  /** Metadados das licitações (dados abertos / export). */
  async exportar() {
    const items = await this.prisma.db.licitacao.findMany({
      where: { ativo: true }, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { numero: true, ano: true, objeto: true, situacao: true, orgao: true, dataAbertura: true, valorEstimado: true, modalidade: { select: { nome: true } }, criterio: { select: { nome: true } }, _count: { select: { documentos: true } } },
    });
    return items.map((l) => ({
      numero: l.numero ?? '', ano: l.ano ?? '', modalidade: l.modalidade?.nome ?? '', criterio: l.criterio?.nome ?? '',
      objeto: l.objeto, situacao: l.situacao ?? '', orgao: l.orgao ?? '', abertura: l.dataAbertura, valorEstimado: l.valorEstimado ?? '', documentos: l._count.documentos,
    }));
  }

  async registrarDownload(docId: string): Promise<string> {
    try {
      const d = await this.prisma.db.licitacaoDocumento.update({
        where: { id: docId },
        data: { downloads: { increment: 1 } },
        select: { arquivoUrl: true },
      });
      if (!d.arquivoUrl) throw new NotFoundException('Documento sem arquivo.');
      return d.arquivoUrl;
    } catch {
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ───────────────────────────── admin: taxonomias ─────────────────────────
  listarModalidades() {
    return this.prisma.db.licitacaoModalidade.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true, lei8666: true, lei14133: true } });
  }
  listarCriterios() {
    return this.prisma.db.licitacaoCriterio.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } });
  }
  // gestão manual das taxonomias (lista TODAS, inclusive inativas)
  listarModalidadesAdmin() {
    return this.prisma.db.licitacaoModalidade.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, nome: true, slug: true, lei8666: true, lei14133: true, ativo: true } });
  }
  listarCriteriosAdmin() {
    return this.prisma.db.licitacaoCriterio.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, nome: true, slug: true, ativo: true } });
  }
  async criarModalidade(dto: { nome: string; lei8666?: boolean; lei14133?: boolean }) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugTaxon('modalidade', slugify(dto.nome) || 'modalidade', tenantId);
    return this.prisma.db.licitacaoModalidade.create({ data: { tenantId, nome: dto.nome, slug, lei8666: !!dto.lei8666, lei14133: !!dto.lei14133, ordem: 999 } });
  }
  atualizarModalidade(id: string, dto: { nome?: string; lei8666?: boolean; lei14133?: boolean; ativo?: boolean }) {
    const data: any = {};
    for (const k of ['nome', 'lei8666', 'lei14133', 'ativo'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    return this.prisma.db.licitacaoModalidade.update({ where: { id }, data });
  }
  excluirModalidade(id: string) {
    return this.prisma.db.licitacaoModalidade.delete({ where: { id } }).then(() => ({ excluido: true }));
  }
  async criarCriterio(dto: { nome: string }) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugTaxon('criterio', slugify(dto.nome) || 'criterio', tenantId);
    return this.prisma.db.licitacaoCriterio.create({ data: { tenantId, nome: dto.nome, slug, ordem: 999 } });
  }
  atualizarCriterio(id: string, dto: { nome?: string; ativo?: boolean }) {
    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    return this.prisma.db.licitacaoCriterio.update({ where: { id }, data });
  }
  excluirCriterio(id: string) {
    return this.prisma.db.licitacaoCriterio.delete({ where: { id } }).then(() => ({ excluido: true }));
  }
  private async slugTaxon(tabela: 'modalidade' | 'criterio', base: string, tenantId: string): Promise<string> {
    const acha = (slug: string) =>
      tabela === 'modalidade'
        ? this.prisma.platform().licitacaoModalidade.findFirst({ where: { tenantId, slug }, select: { id: true } })
        : this.prisma.platform().licitacaoCriterio.findFirst({ where: { tenantId, slug }, select: { id: true } });
    let slug = base;
    while (await acha(slug)) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }

  // ───────────────────────────── admin: licitações ─────────────────────────
  async listarAdmin(p: { q?: string; ano?: number; page?: number }) {
    const page = Math.max(1, p.page ?? 1);
    const pageSize = 20;
    const where: any = {};
    if (p.ano) where.ano = p.ano;
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      where.OR = [{ objeto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }];
    }
    const [total, items] = await Promise.all([
      this.prisma.db.licitacao.count({ where }),
      this.prisma.db.licitacao.findMany({
        where, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, numero: true, ano: true, objeto: true, situacao: true, ativo: true,
          modalidade: { select: { nome: true } }, _count: { select: { documentos: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  obter(id: string) {
    return this.prisma.db.licitacao
      .findUniqueOrThrow({
        where: { id },
        include: { documentos: { orderBy: { ordem: 'asc' } } },
      })
      .catch(() => { throw new NotFoundException('Licitação não encontrada.'); });
  }

  async criar(dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const base = dto.numero ? `${dto.numero}-${dto.ano ?? ''}` : dto.objeto;
    const slug = await this.slugUnico(slugify(base) || 'licitacao', tenantId);
    const lic = await this.prisma.db.licitacao.create({
      data: {
        tenantId, slug, modalidadeId: dto.modalidadeId || null, criterioId: dto.criterioId || null,
        numero: dto.numero || null, ano: dto.ano ?? null, objeto: dto.objeto,
        situacao: dto.situacao || null, orgao: dto.orgao || null,
        dataAbertura: dto.dataAbertura ? new Date(dto.dataAbertura) : null,
        valorEstimado: dto.valorEstimado != null ? dto.valorEstimado : null,
      },
    });
    await this.audit(tenantId, atorId, 'LICITACAO_CRIADA', lic.id, { slug });
    this.buscaSync.enqueue('licitacao', lic.id).catch(() => undefined);
    return lic;
  }

  async atualizar(id: string, dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    for (const k of ['modalidadeId', 'criterioId', 'numero', 'ano', 'objeto', 'situacao', 'orgao', 'valorEstimado', 'ativo'] as const) {
      if (dto[k] !== undefined) data[k] = k === 'modalidadeId' || k === 'criterioId' ? (dto[k] || null) : dto[k];
    }
    if (dto.dataAbertura !== undefined) data.dataAbertura = dto.dataAbertura ? new Date(dto.dataAbertura) : null;
    const lic = await this.prisma.db.licitacao.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'LICITACAO_ATUALIZADA', id, {});
    this.buscaSync.enqueue('licitacao', id).catch(() => undefined);
    return lic;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.licitacao.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'LICITACAO_EXCLUIDA', id, {});
    this.buscaSync.enqueue('licitacao', id).catch(() => undefined);
    return { excluido: true };
  }

  // ───────────────────────────── admin: documentos da licitação ────────────
  async adicionarDocumento(licitacaoId: string, dto: { fase: string; titulo: string; arquivoUrl?: string; ordem?: number }) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.licitacaoDocumento.create({
      data: { tenantId, licitacaoId, fase: dto.fase, titulo: dto.titulo, arquivoUrl: dto.arquivoUrl || null, ordem: dto.ordem ?? 0 },
    });
  }
  async atualizarDocumento(id: string, dto: { fase?: string; titulo?: string; arquivoUrl?: string; ordem?: number }) {
    const data: any = {};
    if (dto.fase !== undefined) data.fase = dto.fase;
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.arquivoUrl !== undefined) data.arquivoUrl = dto.arquivoUrl || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    return this.prisma.db.licitacaoDocumento.update({ where: { id }, data });
  }
  async excluirDocumento(id: string) {
    await this.prisma.db.licitacaoDocumento.delete({ where: { id } });
    return { excluido: true };
  }

  // ───────────────────────────── helpers ───────────────────────────────────
  private async slugUnico(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().licitacao.findFirst({ where: { tenantId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }
  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidadeId: string, dados: any) {
    try {
      await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade: 'licitacoes', entidadeId, dados } });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${(e as Error).message}`);
    }
  }
}
