import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { CONSELHO_TIPOS } from './seeds-conselho';
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
 * Cadastro de Conselhos Municipais (Fase 3). Cada conselho tem um tipo
 * (taxonomia TCE-MT), MEMBROS (com papel/segmento/mandato) e DOCUMENTOS (atas,
 * lei de criação, regimento…), cada documento com contador de downloads.
 * RLS por tenant; seeding cross-tenant (platform()).
 */
@Injectable()
export class ConselhosService {
  private readonly log = new Logger(ConselhosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ───────────────────────────── seeding ───────────────────────────────────
  async semearTenant(tenantId: string): Promise<{ seeded: boolean }> {
    const db = this.prisma.platform();
    const jaTem = await db.conselhoTipo.findFirst({ where: { tenantId }, select: { id: true } });
    if (jaTem) return { seeded: false };
    await db.conselhoTipo.createMany({ data: CONSELHO_TIPOS.map((t) => ({ tenantId, ...t })) });
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', 'Documentos Oficiais', 'documentos_root');
    await this.menus.criarItemAuto(tenantId, {
      local: 'cabecalho', parentId: grupoId, label: 'Conselhos Municipais', tipo: 'interno',
      href: '/conselhos', icone: 'users', refTipo: 'conselhos_menu', refId: tenantId,
    });
    return { seeded: true };
  }

  // ───────────────────────────── público ───────────────────────────────────
  async listarPublico(p: { tipo?: string; q?: string }) {
    const where: any = { ativo: true };
    if (p.tipo) {
      const t = await this.prisma.db.conselhoTipo.findFirst({ where: { slug: p.tipo }, select: { id: true } });
      where.tipoId = t?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { sigla: { contains: q, mode: 'insensitive' } }];
    }
    return this.prisma.db.conselho.findMany({
      where,
      orderBy: { nome: 'asc' },
      select: {
        id: true, slug: true, nome: true, sigla: true, descricao: true,
        tipo: { select: { nome: true } },
        _count: { select: { membros: true, documentos: true } },
      },
    });
  }

  async porSlug(slug: string) {
    const c = await this.prisma.db.conselho.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, nome: true, sigla: true, descricao: true, leiCriacao: true,
        mandatoInicio: true, mandatoFim: true, email: true,
        tipo: { select: { nome: true } },
        membros: { orderBy: { ordem: 'asc' }, select: { id: true, nome: true, papel: true, segmento: true, inicio: true, fim: true } },
        documentos: { orderBy: { ordem: 'asc' }, select: { id: true, categoria: true, titulo: true, dataDocumento: true, arquivoUrl: true, downloads: true } },
      },
    });
    if (!c) throw new NotFoundException('Conselho não encontrado.');
    return c;
  }

  tiposEmUso() {
    return this.prisma.db.conselhoTipo.findMany({
      where: { conselhos: { some: { ativo: true } } },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true },
    });
  }

  async exportar() {
    const items = await this.prisma.db.conselho.findMany({
      where: { ativo: true }, orderBy: { nome: 'asc' },
      select: { nome: true, sigla: true, leiCriacao: true, mandatoInicio: true, mandatoFim: true, email: true, tipo: { select: { nome: true } }, _count: { select: { membros: true, documentos: true } } },
    });
    return items.map((c) => ({
      tipo: c.tipo?.nome ?? '', nome: c.nome, sigla: c.sigla ?? '', leiCriacao: c.leiCriacao ?? '',
      mandatoInicio: c.mandatoInicio, mandatoFim: c.mandatoFim, email: c.email ?? '', membros: c._count.membros, documentos: c._count.documentos,
    }));
  }

  async registrarDownload(docId: string): Promise<string> {
    try {
      const d = await this.prisma.db.conselhoDocumento.update({ where: { id: docId }, data: { downloads: { increment: 1 } }, select: { arquivoUrl: true } });
      if (!d.arquivoUrl) throw new NotFoundException('Documento sem arquivo.');
      return d.arquivoUrl;
    } catch {
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ───────────────────────────── admin ─────────────────────────────────────
  listarTipos() {
    return this.prisma.db.conselhoTipo.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true, obrigatorio: true } });
  }
  // gestão manual da taxonomia de tipos de conselho
  listarTiposAdmin() {
    return this.prisma.db.conselhoTipo.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, nome: true, slug: true, obrigatorio: true, ativo: true } });
  }
  async criarTipo(dto: { nome: string; obrigatorio?: boolean }) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugTipo(slugify(dto.nome) || 'tipo', tenantId);
    return this.prisma.db.conselhoTipo.create({ data: { tenantId, nome: dto.nome, slug, obrigatorio: !!dto.obrigatorio, ordem: 999 } });
  }
  atualizarTipo(id: string, dto: { nome?: string; obrigatorio?: boolean; ativo?: boolean }) {
    const data: any = {};
    for (const k of ['nome', 'obrigatorio', 'ativo'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    return this.prisma.db.conselhoTipo.update({ where: { id }, data });
  }
  excluirTipo(id: string) {
    return this.prisma.db.conselhoTipo.delete({ where: { id } }).then(() => ({ excluido: true }));
  }
  private async slugTipo(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().conselhoTipo.findFirst({ where: { tenantId, slug }, select: { id: true } })) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }

  listarAdmin() {
    return this.prisma.db.conselho.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, sigla: true, ativo: true, tipo: { select: { nome: true } }, _count: { select: { membros: true, documentos: true } } },
    });
  }

  obter(id: string) {
    return this.prisma.db.conselho
      .findUniqueOrThrow({ where: { id }, include: { membros: { orderBy: { ordem: 'asc' } }, documentos: { orderBy: { ordem: 'asc' } } } })
      .catch(() => { throw new NotFoundException('Conselho não encontrado.'); });
  }

  async criar(dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugUnico(slugify(dto.sigla || dto.nome) || 'conselho', tenantId);
    const c = await this.prisma.db.conselho.create({
      data: {
        tenantId, slug, tipoId: dto.tipoId || null, nome: dto.nome, sigla: dto.sigla || null,
        descricao: dto.descricao || null, leiCriacao: dto.leiCriacao || null, email: dto.email || null,
        mandatoInicio: dto.mandatoInicio ? new Date(dto.mandatoInicio) : null,
        mandatoFim: dto.mandatoFim ? new Date(dto.mandatoFim) : null,
      },
    });
    await this.audit(tenantId, atorId, 'CONSELHO_CRIADO', c.id, { slug });
    this.buscaSync.enqueue('conselho', c.id).catch(() => undefined);
    return c;
  }

  async atualizar(id: string, dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    for (const k of ['tipoId', 'nome', 'sigla', 'descricao', 'leiCriacao', 'email', 'ativo'] as const) {
      if (dto[k] !== undefined) data[k] = k === 'tipoId' ? (dto[k] || null) : dto[k];
    }
    if (dto.mandatoInicio !== undefined) data.mandatoInicio = dto.mandatoInicio ? new Date(dto.mandatoInicio) : null;
    if (dto.mandatoFim !== undefined) data.mandatoFim = dto.mandatoFim ? new Date(dto.mandatoFim) : null;
    const c = await this.prisma.db.conselho.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'CONSELHO_ATUALIZADO', id, {});
    this.buscaSync.enqueue('conselho', id).catch(() => undefined);
    return c;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.conselho.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'CONSELHO_EXCLUIDO', id, {});
    this.buscaSync.enqueue('conselho', id).catch(() => undefined);
    return { excluido: true };
  }

  // membros
  async addMembro(conselhoId: string, dto: { nome: string; papel: string; segmento?: string; inicio?: string; fim?: string; ordem?: number }) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.conselhoMembro.create({
      data: {
        tenantId, conselhoId, nome: dto.nome, papel: dto.papel, segmento: dto.segmento || null,
        inicio: dto.inicio ? new Date(dto.inicio) : null, fim: dto.fim ? new Date(dto.fim) : null, ordem: dto.ordem ?? 0,
      },
    });
  }
  excluirMembro(id: string) {
    return this.prisma.db.conselhoMembro.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // documentos
  async addDocumento(conselhoId: string, dto: { categoria: string; titulo: string; arquivoUrl?: string; dataDocumento?: string; ordem?: number }) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.conselhoDocumento.create({
      data: {
        tenantId, conselhoId, categoria: dto.categoria, titulo: dto.titulo, arquivoUrl: dto.arquivoUrl || null,
        dataDocumento: dto.dataDocumento ? new Date(dto.dataDocumento) : null, ordem: dto.ordem ?? 0,
      },
    });
  }
  excluirDocumento(id: string) {
    return this.prisma.db.conselhoDocumento.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ───────────────────────────── helpers ───────────────────────────────────
  private async slugUnico(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().conselho.findFirst({ where: { tenantId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }
  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidadeId: string, dados: any) {
    try {
      await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade: 'conselhos', entidadeId, dados } });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${(e as Error).message}`);
    }
  }
}
