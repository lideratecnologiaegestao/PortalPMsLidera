import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { TEMPLATES, encontrarTemplate } from './cms-templates';
import { BuscaSyncService } from '../busca/busca-sync.service';

export interface NovaPagina {
  slug: string;
  titulo: string;
  seo?: Record<string, unknown>;
  /** Se true, cria automaticamente item de menu no cabeçalho. */
  criarMenu?: boolean;
  /** Id de um template pré-definido. Se válido, cria os blocos do template. */
  template?: string;
}
export interface AtualizaPagina {
  titulo?: string;
  publicado?: boolean;
  /** Shape livre: { title?, description?, ogImage?, keywords?, ... } */
  seo?: Record<string, unknown>;
}
export interface NovoBloco {
  tipo: string;
  conteudo?: Record<string, unknown>;
  ordem?: number;
  visivel?: boolean;
}
export interface OrdemBloco {
  id: string;
  ordem: number;
}

/** Número máximo de snapshots mantidos por página (evita crescimento infinito). */
const MAX_SNAPSHOTS_POR_PAGINA = 30;

/**
 * CMS de páginas por blocos. Todo acesso passa pelo RLS (isolado por tenant).
 * Leitura pública só enxerga páginas publicadas e blocos visíveis; a edição é
 * restrita por RBAC (gestor/admin) no controller.
 */
@Injectable()
export class CmsService {
  private readonly logger = new Logger(CmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  /** Página publicada + blocos visíveis ordenados (renderização do portal). Inclui `seo`. */
  async paginaPublica(slug: string) {
    const page = await this.prisma.db.cmsPage.findFirst({
      where: { slug, publicado: true },
      select: {
        id: true,
        slug: true,
        titulo: true,
        publicado: true,
        seo: true,
        criadoEm: true,
        atualizadoEm: true,
        blocks: {
          where: { visivel: true },
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            tipo: true,
            conteudo: true,
            ordem: true,
            visivel: true,
          },
        },
      },
    });
    if (!page) throw new NotFoundException(`Página "${slug}" não encontrada.`);
    return page;
  }

  /** Lista pública das páginas publicadas (slug + título) — Mapa do Site. */
  async listarPublicadas() {
    return this.prisma.db.cmsPage.findMany({
      where: { publicado: true },
      select: { slug: true, titulo: true },
      orderBy: { titulo: 'asc' },
    });
  }

  /** Página completa para edição (inclui rascunho e blocos ocultos). */
  async paginaAdmin(id: string) {
    const page = await this.prisma.db.cmsPage.findUnique({
      where: { id },
      include: { blocks: { orderBy: { ordem: 'asc' } } },
    });
    if (!page) throw new NotFoundException('Página não encontrada.');
    return page;
  }

  async criarPagina(dto: NovaPagina) {
    const tenantId = TenantContext.tenantId()!;

    // Valida template se informado
    let tmpl = dto.template ? encontrarTemplate(dto.template) : undefined;
    if (dto.template && !tmpl) {
      throw new BadRequestException(
        `Template "${dto.template}" não encontrado. Templates disponíveis: ${TEMPLATES.map((t) => t.id).join(', ')}.`,
      );
    }

    const page = await this.prisma.db.cmsPage.create({
      data: { tenantId, slug: dto.slug, titulo: dto.titulo, seo: dto.seo ?? {} },
    });

    // Insere blocos do template (ordem sequencial a partir de 0)
    if (tmpl) {
      for (let i = 0; i < tmpl.blocos.length; i++) {
        const b = tmpl.blocos[i];
        await this.prisma.db.cmsBlock.create({
          data: {
            tenantId,
            pageId: page.id,
            tipo: b.tipo,
            conteudo: b.conteudo,
            ordem: i,
            visivel: true,
          },
        });
      }
    }

    // Hook: auto-cadastro no menu cabeçalho
    if (dto.criarMenu) {
      try {
        await this.menus.criarItemAutoRls({
          local: 'cabecalho',
          label: dto.titulo,
          tipo: 'interno',
          href: '/' + dto.slug,
          refTipo: 'pagina',
          refId: page.id,
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao criar item de menu para página ${page.id}: ${(err as Error).message}`,
        );
      }
    }

    // Retorna com blocos se template foi aplicado
    if (tmpl) {
      const resultado = await this.paginaAdmin(page.id);
      this.buscaSync.enqueue('cms', page.id).catch(() => undefined);
      return resultado;
    }
    this.buscaSync.enqueue('cms', page.id).catch(() => undefined);
    return page;
  }

  async atualizarPagina(id: string, dto: AtualizaPagina) {
    await this.paginaAdmin(id); // garante existência no tenant (RLS)
    const atualizado = await this.prisma.db.cmsPage.update({
      where: { id },
      data: {
        titulo: dto.titulo,
        publicado: dto.publicado,
        seo: dto.seo as object | undefined,
      },
    });
    this.buscaSync.enqueue('cms', id).catch(() => undefined);
    return atualizado;
  }

  async adicionarBloco(pageId: string, dto: NovoBloco) {
    const tenantId = TenantContext.tenantId()!;
    await this.paginaAdmin(pageId); // valida que a página é do tenant

    // ordem padrão: ao fim da página
    const ordem =
      dto.ordem ??
      ((
        await this.prisma.db.cmsBlock.aggregate({
          where: { pageId },
          _max: { ordem: true },
        })
      )._max.ordem ?? -1) + 1;

    return this.prisma.db.cmsBlock.create({
      data: {
        tenantId,
        pageId,
        tipo: dto.tipo,
        conteudo: dto.conteudo ?? {},
        ordem,
        visivel: dto.visivel ?? true,
      },
    });
  }

  async atualizarBloco(id: string, dto: Partial<NovoBloco>) {
    const bloco = await this.prisma.db.cmsBlock.findUnique({ where: { id } });
    if (!bloco) throw new NotFoundException('Bloco não encontrado.');
    return this.prisma.db.cmsBlock.update({
      where: { id },
      data: {
        tipo: dto.tipo,
        conteudo: dto.conteudo as object | undefined,
        ordem: dto.ordem,
        visivel: dto.visivel,
      },
    });
  }

  async removerBloco(id: string) {
    const bloco = await this.prisma.db.cmsBlock.findUnique({ where: { id } });
    if (!bloco) throw new NotFoundException('Bloco não encontrado.');
    await this.prisma.db.cmsBlock.delete({ where: { id } });
    return { removido: true };
  }

  // --------------------------------------------------------- admin listagem
  /** Lista páginas do tenant com paginação. */
  async listarAdmin(opts: { q?: string; page: number; pageSize: number }) {
    const where: Record<string, unknown> = {};
    if (opts.q) {
      where.OR = [
        { titulo: { contains: opts.q, mode: 'insensitive' } },
        { slug: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.db.cmsPage.findMany({
        where,
        orderBy: { atualizadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          slug: true,
          titulo: true,
          publicado: true,
          atualizadoEm: true,
        },
      }),
      this.prisma.db.cmsPage.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /** Exclui página e seus blocos (cascade pelo banco). Salva snapshot antes. Audit. */
  async excluirPagina(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const page = await this.prisma.db.cmsPage.findUnique({
      where: { id },
      select: { id: true, slug: true, titulo: true },
    });
    if (!page) throw new NotFoundException('Página não encontrada.');

    // Snapshot de segurança antes de excluir
    await this.salvarSnapshot(id, 'antes_de_excluir');

    // CmsBlock tem onDelete: Cascade — blocos são removidos automaticamente.
    await this.prisma.db.cmsPage.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'CMS_PAGINA_EXCLUIDA',
        entidade: 'cms_pages',
        entidadeId: id,
        dados: { slug: page.slug, titulo: page.titulo },
      },
    });

    // Hook: remove item de menu vinculado
    try {
      await this.menus.removerPorRef('pagina', id);
    } catch (err) {
      this.logger.warn(
        `Falha ao remover item de menu da página ${id}: ${(err as Error).message}`,
      );
    }

    return { excluido: true };
  }

  // -------------------------------------------------- reordenação em lote
  /**
   * Reordena blocos de uma página em lote dentro de uma transação.
   * Valida que todos os blocos pertencem à página (RLS já isola o tenant).
   */
  async reordenarBlocos(pageId: string, ordens: OrdemBloco[]) {
    await this.paginaAdmin(pageId); // garante que a página existe no tenant

    if (!ordens.length) return this.paginaAdmin(pageId);

    // Valida que todos os blocos pertencem à página
    const ids = ordens.map((o) => o.id);
    const blocos = await this.prisma.db.cmsBlock.findMany({
      where: { id: { in: ids }, pageId },
      select: { id: true },
    });
    if (blocos.length !== ids.length) {
      throw new BadRequestException(
        'Um ou mais blocos não pertencem a esta página ou não foram encontrados.',
      );
    }

    // Atualiza ordens em transação
    await this.prisma.tx(async (tx) => {
      for (const { id, ordem } of ordens) {
        await tx.cmsBlock.update({ where: { id }, data: { ordem } });
      }
    });

    return this.paginaAdmin(pageId);
  }

  // -------------------------------------------- versionamento / snapshots

  /**
   * Helper privado: carrega estado atual da página + blocos e grava 1 linha
   * em `cms_page_snapshots`. Limpa snapshots além do limite máximo.
   */
  private async salvarSnapshot(pageId: string, motivo: string): Promise<void> {
    const tenantId = TenantContext.tenantId()!;
    const userId = TenantContext.get().userId ?? null;

    const page = await this.prisma.db.cmsPage.findUnique({
      where: { id: pageId },
      include: { blocks: { orderBy: { ordem: 'asc' } } },
    });
    if (!page) return; // página inexistente: não lança (pode já ter sido excluída)

    const snapshotPayload = {
      titulo: page.titulo,
      publicado: page.publicado,
      seo: page.seo,
      blocos: page.blocks.map((b) => ({
        tipo: b.tipo,
        conteudo: b.conteudo,
        ordem: b.ordem,
        visivel: b.visivel,
      })),
    };

    await this.prisma.db.cmsPageSnapshot.create({
      data: {
        tenantId,
        pageId,
        titulo: page.titulo,
        snapshot: snapshotPayload,
        motivo,
        criadoPor: userId,
      },
    });

    // Limpeza: mantém no máx. MAX_SNAPSHOTS_POR_PAGINA por página
    const total = await this.prisma.db.cmsPageSnapshot.count({ where: { pageId } });
    if (total > MAX_SNAPSHOTS_POR_PAGINA) {
      const excesso = await this.prisma.db.cmsPageSnapshot.findMany({
        where: { pageId },
        orderBy: { criadoEm: 'asc' },
        take: total - MAX_SNAPSHOTS_POR_PAGINA,
        select: { id: true },
      });
      if (excesso.length) {
        await this.prisma.db.cmsPageSnapshot.deleteMany({
          where: { id: { in: excesso.map((s) => s.id) } },
        });
      }
    }
  }

  /** Lista snapshots de uma página (id, titulo, motivo, criadoEm) — limite 50. */
  async listarSnapshots(pageId: string) {
    await this.paginaAdmin(pageId); // valida existência + RLS
    return this.prisma.db.cmsPageSnapshot.findMany({
      where: { pageId },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      select: { id: true, titulo: true, motivo: true, criadoEm: true, criadoPor: true },
    });
  }

  /** Cria snapshot manual da página (motivo = 'manual'). Audita. */
  async criarSnapshotManual(pageId: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.paginaAdmin(pageId); // valida existência + RLS
    await this.salvarSnapshot(pageId, 'manual');

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'CMS_SNAPSHOT_CRIADO',
        entidade: 'cms_page_snapshots',
        entidadeId: pageId,
        dados: { pageId, motivo: 'manual' },
      },
    });

    // Retorna o snapshot recém-criado
    const snap = await this.prisma.db.cmsPageSnapshot.findFirst({
      where: { pageId, motivo: 'manual' },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, titulo: true, motivo: true, criadoEm: true, criadoPor: true },
    });
    return snap;
  }

  /** Retorna snapshot completo (para preview). */
  async obterSnapshot(pageId: string, snapId: string) {
    await this.paginaAdmin(pageId); // valida página no tenant
    const snap = await this.prisma.db.cmsPageSnapshot.findUnique({
      where: { id: snapId },
    });
    if (!snap || snap.pageId !== pageId) {
      throw new NotFoundException('Snapshot não encontrado.');
    }
    return snap;
  }

  /**
   * Restaura uma página a partir de um snapshot.
   * Salva snapshot 'antes_de_restaurar' do estado atual, depois substitui
   * titulo/seo/publicado e blocos em transação. Audita.
   */
  async restaurarSnapshot(pageId: string, snapId: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.paginaAdmin(pageId); // valida página no tenant

    const snap = await this.prisma.db.cmsPageSnapshot.findUnique({
      where: { id: snapId },
    });
    if (!snap || snap.pageId !== pageId) {
      throw new NotFoundException('Snapshot não encontrado.');
    }

    // Salva estado atual antes de sobrescrever
    await this.salvarSnapshot(pageId, 'antes_de_restaurar');

    const payload = snap.snapshot as {
      titulo?: string;
      publicado?: boolean;
      seo?: Record<string, unknown>;
      blocos?: Array<{ tipo: string; conteudo: Record<string, unknown>; ordem: number; visivel: boolean }>;
    };

    // Restaura em transação: atualiza página + substitui blocos
    await this.prisma.tx(async (tx) => {
      // Atualiza metadados da página
      await tx.cmsPage.update({
        where: { id: pageId },
        data: {
          titulo: payload.titulo,
          publicado: payload.publicado,
          seo: payload.seo as object | undefined,
        },
      });

      // Remove blocos atuais e recria a partir do snapshot
      await tx.cmsBlock.deleteMany({ where: { pageId } });

      if (payload.blocos?.length) {
        await tx.cmsBlock.createMany({
          data: payload.blocos.map((b) => ({
            tenantId,
            pageId,
            tipo: b.tipo,
            conteudo: b.conteudo as object,
            ordem: b.ordem,
            visivel: b.visivel,
          })),
        });
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'CMS_PAGINA_RESTAURADA',
        entidade: 'cms_pages',
        entidadeId: pageId,
        dados: { snapId, titulo: snap.titulo, motivo: snap.motivo },
      },
    });

    return this.paginaAdmin(pageId);
  }

  // -------------------------------------------------- templates (listagem)
  /** Lista os templates de página disponíveis (id, nome, descricao). */
  listarTemplates() {
    return TEMPLATES.map(({ id, nome, descricao }) => ({ id, nome, descricao }));
  }
}
