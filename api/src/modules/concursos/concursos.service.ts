import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { CONCURSO_TIPOS, CONCURSO_DOC_TIPOS } from './seeds-concurso';
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
 * Cadastro de Concursos e Processos Seletivos (Fase 4). Cada concurso tem um
 * tipo de certame (TCE-MT) e DOCUMENTOS por fase (taxonomia de 40 tipos com a
 * situação/fase e a flag de publicação obrigatória), cada documento com contador
 * de downloads. RLS por tenant; seeding cross-tenant (platform()).
 */
@Injectable()
export class ConcursosService {
  private readonly log = new Logger(ConcursosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ───────────────────────────── seeding ───────────────────────────────────
  async semearTenant(tenantId: string): Promise<{ seeded: boolean }> {
    const db = this.prisma.platform();
    const jaTem = await db.concursoTipo.findFirst({ where: { tenantId }, select: { id: true } });
    if (jaTem) return { seeded: false };
    await db.concursoTipo.createMany({ data: CONCURSO_TIPOS.map((t) => ({ tenantId, ...t })) });
    await db.concursoDocTipo.createMany({ data: CONCURSO_DOC_TIPOS.map((t) => ({ tenantId, ...t })) });
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', 'Documentos Oficiais', 'documentos_root');
    await this.menus.criarItemAuto(tenantId, {
      local: 'cabecalho', parentId: grupoId, label: 'Concursos e Seletivos', tipo: 'interno',
      href: '/concursos', icone: 'file', refTipo: 'concursos_menu', refId: tenantId,
    });
    return { seeded: true };
  }

  // ───────────────────────────── público ───────────────────────────────────
  async listarPublico(p: { tipo?: string; situacao?: string; ano?: number; q?: string }) {
    const where: any = { ativo: true };
    if (p.situacao) where.situacao = p.situacao;
    if (p.ano) where.ano = p.ano;
    if (p.tipo) {
      const t = await this.prisma.db.concursoTipo.findFirst({ where: { slug: p.tipo }, select: { id: true } });
      where.tipoId = t?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      where.OR = [{ objeto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }];
    }
    return this.prisma.db.concurso.findMany({
      where,
      orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: {
        id: true, slug: true, numero: true, ano: true, objeto: true, situacao: true, orgao: true, banca: true,
        tipo: { select: { nome: true } },
        _count: { select: { documentos: true } },
      },
    });
  }

  async porSlug(slug: string) {
    const c = await this.prisma.db.concurso.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, numero: true, ano: true, objeto: true, situacao: true, orgao: true, banca: true,
        tipo: { select: { nome: true } },
        documentos: { orderBy: { ordem: 'asc' }, select: { id: true, fase: true, titulo: true, dataDocumento: true, arquivoUrl: true, downloads: true } },
      },
    });
    if (!c) throw new NotFoundException('Concurso não encontrado.');
    return c;
  }

  tiposEmUso() {
    return this.prisma.db.concursoTipo.findMany({
      where: { concursos: { some: { ativo: true } } },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true },
    });
  }

  async exportar() {
    const items = await this.prisma.db.concurso.findMany({
      where: { ativo: true }, orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { numero: true, ano: true, objeto: true, situacao: true, orgao: true, banca: true, tipo: { select: { nome: true } }, _count: { select: { documentos: true } } },
    });
    return items.map((c) => ({
      tipo: c.tipo?.nome ?? '', numero: c.numero ?? '', ano: c.ano ?? '', objeto: c.objeto,
      situacao: c.situacao ?? '', orgao: c.orgao ?? '', banca: c.banca ?? '', documentos: c._count.documentos,
    }));
  }

  async registrarDownload(docId: string): Promise<string> {
    try {
      const d = await this.prisma.db.concursoDocumento.update({ where: { id: docId }, data: { downloads: { increment: 1 } }, select: { arquivoUrl: true } });
      if (!d.arquivoUrl) throw new NotFoundException('Documento sem arquivo.');
      return d.arquivoUrl;
    } catch {
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ───────────────────────────── admin ─────────────────────────────────────
  listarTipos() {
    return this.prisma.db.concursoTipo.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } });
  }
  /** Os 40 tipos de documento (com situação/fase) para o seletor do admin. */
  listarDocTipos() {
    return this.prisma.db.concursoDocTipo.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true, situacao: true, obrigatorio: true } });
  }
  // ── gestão manual das taxonomias (certames e tipos de documento) ──
  listarTiposAdmin() {
    return this.prisma.db.concursoTipo.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, nome: true, slug: true, ativo: true } });
  }
  listarDocTiposAdmin() {
    return this.prisma.db.concursoDocTipo.findMany({ orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, nome: true, situacao: true, obrigatorio: true, ativo: true } });
  }
  async criarTipo(dto: { nome: string }) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugCertame(slugify(dto.nome) || 'certame', tenantId);
    return this.prisma.db.concursoTipo.create({ data: { tenantId, nome: dto.nome, slug, ordem: 999 } });
  }
  atualizarTipo(id: string, dto: { nome?: string; ativo?: boolean }) {
    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    return this.prisma.db.concursoTipo.update({ where: { id }, data });
  }
  excluirTipo(id: string) {
    return this.prisma.db.concursoTipo.delete({ where: { id } }).then(() => ({ excluido: true }));
  }
  async criarDocTipo(dto: { nome: string; situacao?: string; obrigatorio?: boolean }) {
    const tenantId = TenantContext.tenantId()!;
    // codigo manual: 'M-' + hex (não colide com os códigos numéricos do seed)
    const codigo = `M-${randomBytes(3).toString('hex')}`;
    return this.prisma.db.concursoDocTipo.create({ data: { tenantId, codigo, nome: dto.nome, slug: slugify(dto.nome) || null, situacao: dto.situacao || null, obrigatorio: !!dto.obrigatorio, ordem: 999 } });
  }
  atualizarDocTipo(id: string, dto: { nome?: string; situacao?: string; obrigatorio?: boolean; ativo?: boolean }) {
    const data: any = {};
    for (const k of ['nome', 'situacao', 'obrigatorio', 'ativo'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    return this.prisma.db.concursoDocTipo.update({ where: { id }, data });
  }
  excluirDocTipo(id: string) {
    return this.prisma.db.concursoDocTipo.delete({ where: { id } }).then(() => ({ excluido: true }));
  }
  private async slugCertame(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().concursoTipo.findFirst({ where: { tenantId, slug }, select: { id: true } })) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }

  listarAdmin() {
    return this.prisma.db.concurso.findMany({
      orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
      select: { id: true, numero: true, ano: true, objeto: true, situacao: true, ativo: true, tipo: { select: { nome: true } }, _count: { select: { documentos: true } } },
    });
  }

  obter(id: string) {
    return this.prisma.db.concurso
      .findUniqueOrThrow({ where: { id }, include: { documentos: { orderBy: { ordem: 'asc' } } } })
      .catch(() => { throw new NotFoundException('Concurso não encontrado.'); });
  }

  async criar(dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const base = dto.numero ? `${dto.numero}-${dto.ano ?? ''}` : dto.objeto;
    const slug = await this.slugUnico(slugify(base) || 'concurso', tenantId);
    const c = await this.prisma.db.concurso.create({
      data: {
        tenantId, slug, tipoId: dto.tipoId || null, numero: dto.numero || null, ano: dto.ano ?? null,
        objeto: dto.objeto, situacao: dto.situacao || null, orgao: dto.orgao || null, banca: dto.banca || null,
      },
    });
    await this.audit(tenantId, atorId, 'CONCURSO_CRIADO', c.id, { slug });
    this.buscaSync.enqueue('concurso', c.id).catch(() => undefined);
    return c;
  }

  async atualizar(id: string, dto: any, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    for (const k of ['tipoId', 'numero', 'ano', 'objeto', 'situacao', 'orgao', 'banca', 'ativo'] as const) {
      if (dto[k] !== undefined) data[k] = k === 'tipoId' ? (dto[k] || null) : dto[k];
    }
    const c = await this.prisma.db.concurso.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'CONCURSO_ATUALIZADO', id, {});
    this.buscaSync.enqueue('concurso', id).catch(() => undefined);
    return c;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.concurso.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'CONCURSO_EXCLUIDO', id, {});
    this.buscaSync.enqueue('concurso', id).catch(() => undefined);
    return { excluido: true };
  }

  // documentos
  async addDocumento(concursoId: string, dto: { docTipoId?: string; fase: string; titulo: string; arquivoUrl?: string; dataDocumento?: string; ordem?: number }) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.concursoDocumento.create({
      data: {
        tenantId, concursoId, docTipoId: dto.docTipoId || null, fase: dto.fase, titulo: dto.titulo,
        arquivoUrl: dto.arquivoUrl || null, dataDocumento: dto.dataDocumento ? new Date(dto.dataDocumento) : null, ordem: dto.ordem ?? 0,
      },
    });
  }
  excluirDocumento(id: string) {
    return this.prisma.db.concursoDocumento.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ───────────────────────────── helpers ───────────────────────────────────
  private async slugUnico(base: string, tenantId: string): Promise<string> {
    let slug = base;
    while (await this.prisma.platform().concurso.findFirst({ where: { tenantId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }
  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidadeId: string, dados: any) {
    try {
      await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade: 'concursos', entidadeId, dados } });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${(e as Error).message}`);
    }
  }
}
