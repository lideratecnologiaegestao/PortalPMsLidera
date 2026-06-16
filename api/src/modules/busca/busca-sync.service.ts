import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  QUEUE_BUSCA,
  JOB_BUSCA_SYNC_ITEM,
  JOB_BUSCA_REINDEX_TENANT,
  JOB_BUSCA_CLEANUP_ORPHANS,
} from '../queue/queue.constants';
import { TipoBusca } from './busca.dto';

/** Pesos por tipo de conteúdo no ranking de busca. */
const PESOS: Record<TipoBusca, number> = {
  servico: 1.1,
  noticia: 1.0,
  secretaria: 1.0,
  cms: 1.0,
  documento: 0.9,
  diario: 0.9,
  licitacao: 0.9,
  contrato: 0.9,
  convenio: 0.9,
  conselho: 0.9,
  concurso: 0.9,
  transparencia: 0.8,
};

/** Remove tags HTML e limita tamanho do texto para snippet_src. */
function stripHtml(html: string | null | undefined, maxChars = 2000): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/** URL canônica pública por tipo (rotas do ADR-0004). */
function urlCanonica(tipo: TipoBusca, refId: string, extra?: Record<string, string>): string {
  switch (tipo) {
    case 'noticia':
      return `/noticias/${refId}`;
    case 'documento':
      return `/documentos/${extra?.cadastroSlug ?? refId}/${refId}`;
    case 'diario':
      return `/diario/materia/${refId}`;
    case 'servico':
      return `/servicos/${refId}`;
    case 'secretaria':
      return `/secretarias/${refId}`;
    case 'cms':
      return `/${refId}`;
    case 'transparencia':
      return `/transparencia`;
    case 'licitacao':
      return `/licitacoes/${refId}`;
    case 'contrato':
      return `/contratos/${refId}`;
    case 'convenio':
      return `/convenios/${refId}`;
    case 'conselho':
      return `/conselhos/${refId}`;
    case 'concurso':
      return `/concursos/${refId}`;
    default:
      return `/${tipo}/${refId}`;
  }
}

/** Payload do job de indexação de item único. */
export interface SyncItemPayload {
  tenantId: string;
  tipo: TipoBusca;
  refId: string;
}

/** Payload do job de reindexação total de tenant. */
export interface ReindexTenantPayload {
  tenantId: string;
}

/** Payload do job de limpeza de órfãos. */
export interface CleanupOrphansPayload {
  tenantId: string;
}

/**
 * BuscaSyncService — orquestra a sincronização do `search_index`.
 *
 * `enqueue()` é chamado fire-and-forget pelos services de conteúdo após cada
 * write bem-sucedido. O worker (`BuscaSyncWorker`) faz o trabalho pesado:
 * valida visibilidade pública, monta o tsvector e executa o UPSERT/DELETE.
 *
 * Os métodos `indexar()` e `remover()` são internos (chamados pelo worker) e
 * executam a SQL raw dentro do TenantContext corrente (RLS via GUC).
 */
@Injectable()
export class BuscaSyncService {
  private readonly log = new Logger(BuscaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_BUSCA) private readonly fila: Queue,
  ) {}

  // ─────────────────────────────────────── enfileiramento ──────────────────

  /**
   * Enfileira a sincronização de um item (fire-and-forget). O jobId idempotente
   * garante que N chamadas simultâneas não causem duplicatas na fila.
   */
  async enqueue(tipo: TipoBusca, refId: string): Promise<void> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return;
    await this.fila.add(
      JOB_BUSCA_SYNC_ITEM,
      { tenantId, tipo, refId } satisfies SyncItemPayload,
      {
        jobId: `busca-${tipo}-${refId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /** Enfileira a reindexação completa de um tenant. */
  async reindexarTenant(tenantId: string): Promise<void> {
    await this.fila.add(
      JOB_BUSCA_REINDEX_TENANT,
      { tenantId } satisfies ReindexTenantPayload,
      {
        jobId: `busca-reindex-${tenantId}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 15000 },
      },
    );
  }

  /** Enfileira a limpeza de órfãos de um tenant. */
  async cleanupOrphans(tenantId: string): Promise<void> {
    await this.fila.add(
      JOB_BUSCA_CLEANUP_ORPHANS,
      { tenantId } satisfies CleanupOrphansPayload,
      {
        jobId: `busca-cleanup-${tenantId}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
      },
    );
  }

  // ──────────────────────────────────────── indexação ──────────────────────

  /**
   * Indexa ou atualiza um item no `search_index`. Chamado pelo worker após
   * validar que o item está público/ativo. Executa dentro do TenantContext
   * corrente → RLS via GUC.
   */
  async indexar(params: {
    tipo: TipoBusca;
    refId: string;
    titulo: string;
    subtitulo?: string | null;
    corpo?: string | null;
    url: string;
    snippetSrc?: string | null;
    peso?: number;
    publicadoEm?: Date | null;
  }): Promise<void> {
    const tenantId = TenantContext.tenantId()!;
    const {
      tipo,
      refId,
      titulo,
      subtitulo,
      corpo,
      url,
      snippetSrc,
      peso = 1.0,
      publicadoEm,
    } = params;

    // Monta o tsvector ponderado no Postgres (pesos A/B/C)
    const tsvectorExpr = Prisma.sql`
      setweight(to_tsvector('portuguese', unaccent(${titulo})), 'A')
      || setweight(to_tsvector('portuguese', unaccent(${subtitulo ?? ''})), 'B')
      || setweight(to_tsvector('portuguese', unaccent(${corpo ?? ''})), 'C')
    `;

    await this.prisma.tx((t) =>
      t.$executeRaw`
        INSERT INTO search_index
          (tenant_id, tipo, ref_id, titulo, subtitulo, url, corpo_tsv, snippet_src, peso, publicado_em, atualizado_em)
        VALUES (
          ${tenantId}::uuid,
          ${tipo},
          ${refId},
          ${titulo},
          ${subtitulo ?? null},
          ${url},
          ${tsvectorExpr},
          ${snippetSrc ?? null},
          ${peso}::real,
          ${publicadoEm ?? null},
          now()
        )
        ON CONFLICT (tenant_id, tipo, ref_id) DO UPDATE SET
          titulo       = EXCLUDED.titulo,
          subtitulo    = EXCLUDED.subtitulo,
          url          = EXCLUDED.url,
          corpo_tsv    = EXCLUDED.corpo_tsv,
          snippet_src  = EXCLUDED.snippet_src,
          peso         = EXCLUDED.peso,
          publicado_em = EXCLUDED.publicado_em,
          atualizado_em = now()
      `,
    );
  }

  /**
   * Remove um item do índice (quando despublicado/excluído). Seguro de chamar
   * mesmo se o item não existir no índice.
   */
  async remover(tipo: TipoBusca, refId: string): Promise<void> {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.tx((t) =>
      t.$executeRaw`
        DELETE FROM search_index
        WHERE tenant_id = ${tenantId}::uuid
          AND tipo = ${tipo}
          AND ref_id = ${refId}
      `,
    );
  }

  // ──────────────────────────────── lógica por tipo (usada pelo worker) ────

  /**
   * Busca os dados da entidade de origem e decide se indexa ou remove.
   * Retorna o número de itens processados (0 ou 1).
   */
  async processarItem(tipo: TipoBusca, refId: string): Promise<number> {
    switch (tipo) {
      case 'noticia':
        return this.processarNoticia(refId);
      case 'documento':
        return this.processarDocumento(refId);
      case 'diario':
        return this.processarDiarioMateria(refId);
      case 'servico':
        return this.processarServico(refId);
      case 'secretaria':
        return this.processarSecretaria(refId);
      case 'cms':
        return this.processarCmsPage(refId);
      case 'licitacao':
        return this.processarLicitacao(refId);
      case 'contrato':
        return this.processarContrato(refId);
      case 'convenio':
        return this.processarConvenio(refId);
      case 'conselho':
        return this.processarConselho(refId);
      case 'concurso':
        return this.processarConcurso(refId);
      case 'transparencia':
        return this.processarTransparencia(refId);
      default:
        return 0;
    }
  }

  // ─────────── processadores por tipo ────────────────────────────────────

  private async processarNoticia(id: string): Promise<number> {
    const row = await this.prisma.db.noticia.findUnique({
      where: { id },
      select: { id: true, slug: true, titulo: true, resumo: true, conteudo: true, publicado: true, publicadoEm: true, categoria: true },
    });
    if (!row || !row.publicado) {
      await this.remover('noticia', id);
      return 0;
    }
    await this.indexar({
      tipo: 'noticia',
      refId: id,
      titulo: row.titulo,
      subtitulo: row.resumo ?? row.categoria ?? null,
      corpo: stripHtml(row.conteudo),
      url: urlCanonica('noticia', row.slug),
      snippetSrc: stripHtml(row.resumo ?? row.conteudo),
      peso: PESOS.noticia,
      publicadoEm: row.publicadoEm,
    });
    return 1;
  }

  private async processarDocumento(id: string): Promise<number> {
    const row = await this.prisma.db.documento.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        ementa: true,
        conteudoExtraido: true,
        ativo: true,
        publicadoEm: true,
        cadastro: { select: { slug: true, visibilidade: true } },
      },
    });
    if (!row || !row.ativo || row.cadastro?.visibilidade !== 'publico') {
      await this.remover('documento', id);
      return 0;
    }
    await this.indexar({
      tipo: 'documento',
      refId: id,
      titulo: row.titulo,
      subtitulo: row.ementa ?? null,
      corpo: stripHtml(row.conteudoExtraido),
      url: urlCanonica('documento', id, { cadastroSlug: row.cadastro?.slug ?? '' }),
      snippetSrc: stripHtml(row.ementa ?? row.conteudoExtraido),
      peso: PESOS.documento,
      publicadoEm: row.publicadoEm,
    });
    return 1;
  }

  private async processarDiarioMateria(id: string): Promise<number> {
    const row = await this.prisma.db.diarioMateria.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        ementa: true,
        conteudo: true,
        criadoEm: true,
        edicao: { select: { status: true, publicadoEm: true } },
      },
    });
    if (!row || row.edicao?.status !== 'publicado') {
      await this.remover('diario', id);
      return 0;
    }
    await this.indexar({
      tipo: 'diario',
      refId: id,
      titulo: row.titulo,
      subtitulo: row.ementa ?? null,
      corpo: stripHtml(row.conteudo),
      url: urlCanonica('diario', id),
      snippetSrc: stripHtml(row.ementa ?? row.conteudo),
      peso: PESOS.diario,
      publicadoEm: row.edicao?.publicadoEm ?? row.criadoEm,
    });
    return 1;
  }

  private async processarServico(id: string): Promise<number> {
    const row = await this.prisma.db.servico.findUnique({
      where: { id },
      select: { id: true, slug: true, titulo: true, descricao: true, categoria: true, publicado: true, criadoEm: true },
    });
    if (!row || !row.publicado) {
      await this.remover('servico', id);
      return 0;
    }
    await this.indexar({
      tipo: 'servico',
      refId: id,
      titulo: row.titulo,
      subtitulo: row.categoria ?? null,
      corpo: stripHtml(row.descricao),
      url: urlCanonica('servico', row.slug),
      snippetSrc: stripHtml(row.descricao),
      peso: PESOS.servico,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarSecretaria(id: string): Promise<number> {
    const row = await this.prisma.db.secretaria.findUnique({
      where: { id },
      select: { id: true, slug: true, nome: true, descricao: true, tipo: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('secretaria', id);
      return 0;
    }
    const slug = row.slug ?? row.id;
    await this.indexar({
      tipo: 'secretaria',
      refId: id,
      titulo: row.nome,
      subtitulo: row.tipo ?? null,
      corpo: stripHtml(row.descricao),
      url: urlCanonica('secretaria', slug),
      snippetSrc: stripHtml(row.descricao),
      peso: PESOS.secretaria,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarCmsPage(id: string): Promise<number> {
    const row = await this.prisma.db.cmsPage.findUnique({
      where: { id },
      select: { id: true, slug: true, titulo: true, publicado: true, criadoEm: true },
    });
    if (!row || !row.publicado) {
      await this.remover('cms', id);
      return 0;
    }
    await this.indexar({
      tipo: 'cms',
      refId: id,
      titulo: row.titulo,
      subtitulo: null,
      corpo: null,
      url: urlCanonica('cms', row.slug),
      snippetSrc: null,
      peso: PESOS.cms,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarLicitacao(id: string): Promise<number> {
    const row = await this.prisma.db.licitacao.findUnique({
      where: { id },
      select: { id: true, slug: true, objeto: true, numero: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('licitacao', id);
      return 0;
    }
    await this.indexar({
      tipo: 'licitacao',
      refId: id,
      titulo: row.objeto ?? `Licitação ${row.numero}`,
      subtitulo: row.numero ?? null,
      corpo: null,
      url: urlCanonica('licitacao', row.slug ?? id),
      snippetSrc: stripHtml(row.objeto),
      peso: PESOS.licitacao,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarContrato(id: string): Promise<number> {
    const row = await this.prisma.db.contrato.findUnique({
      where: { id },
      select: { id: true, slug: true, objeto: true, numero: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('contrato', id);
      return 0;
    }
    await this.indexar({
      tipo: 'contrato',
      refId: id,
      titulo: row.objeto ?? `Contrato ${row.numero}`,
      subtitulo: row.numero ?? null,
      corpo: null,
      url: urlCanonica('contrato', row.slug ?? id),
      snippetSrc: stripHtml(row.objeto),
      peso: PESOS.contrato,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarConvenio(id: string): Promise<number> {
    const row = await this.prisma.db.convenio.findUnique({
      where: { id },
      select: { id: true, slug: true, objeto: true, numero: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('convenio', id);
      return 0;
    }
    await this.indexar({
      tipo: 'convenio',
      refId: id,
      titulo: row.objeto ?? `Convênio ${row.numero}`,
      subtitulo: row.numero ?? null,
      corpo: null,
      url: urlCanonica('convenio', row.slug ?? id),
      snippetSrc: stripHtml(row.objeto),
      peso: PESOS.convenio,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarConselho(id: string): Promise<number> {
    const row = await this.prisma.db.conselho.findUnique({
      where: { id },
      select: { id: true, slug: true, nome: true, descricao: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('conselho', id);
      return 0;
    }
    await this.indexar({
      tipo: 'conselho',
      refId: id,
      titulo: row.nome,
      subtitulo: null,
      corpo: stripHtml(row.descricao),
      url: urlCanonica('conselho', row.slug ?? id),
      snippetSrc: stripHtml(row.descricao),
      peso: PESOS.conselho,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarConcurso(id: string): Promise<number> {
    const row = await this.prisma.db.concurso.findUnique({
      where: { id },
      select: { id: true, slug: true, objeto: true, numero: true, ativo: true, criadoEm: true },
    });
    if (!row || !row.ativo) {
      await this.remover('concurso', id);
      return 0;
    }
    await this.indexar({
      tipo: 'concurso',
      refId: id,
      titulo: row.objeto ?? `Concurso ${row.numero ?? id}`,
      subtitulo: row.numero ?? null,
      corpo: null,
      url: urlCanonica('concurso', row.slug ?? id),
      snippetSrc: stripHtml(row.objeto),
      peso: PESOS.concurso,
      publicadoEm: row.criadoEm,
    });
    return 1;
  }

  private async processarTransparencia(id: string): Promise<number> {
    // transp_documentos: indexa apenas os com visibilidade pública (campo ativo/público)
    // Usamos raw pois o model TranspDocumento pode não estar mapeado como Prisma model
    const rows = await this.prisma.tx((t) =>
      t.$queryRaw<{ id: string; titulo: string; descricao: string | null; criado_em: Date }[]>`
        SELECT id, titulo, descricao, criado_em
        FROM transp_documentos
        WHERE id = ${id}::uuid AND ativo = true
        LIMIT 1
      `,
    );
    if (!rows.length) {
      await this.remover('transparencia', id);
      return 0;
    }
    const row = rows[0];
    await this.indexar({
      tipo: 'transparencia',
      refId: id,
      titulo: row.titulo,
      subtitulo: null,
      corpo: stripHtml(row.descricao),
      url: urlCanonica('transparencia', id),
      snippetSrc: stripHtml(row.descricao),
      peso: PESOS.transparencia,
      publicadoEm: row.criado_em,
    });
    return 1;
  }

  // ────────────────────────── reindexação total do tenant ──────────────────

  /**
   * Reindexação full do tenant: varre todas as fontes públicas e indexa em lote.
   * Retorna o total de itens indexados.
   */
  async reindexarTodas(): Promise<number> {
    let total = 0;
    total += await this.reindexarFonte('noticia');
    total += await this.reindexarFonte('documento');
    total += await this.reindexarFonte('diario');
    total += await this.reindexarFonte('servico');
    total += await this.reindexarFonte('secretaria');
    total += await this.reindexarFonte('cms');
    total += await this.reindexarFonte('licitacao');
    total += await this.reindexarFonte('contrato');
    total += await this.reindexarFonte('convenio');
    total += await this.reindexarFonte('conselho');
    total += await this.reindexarFonte('concurso');
    return total;
  }

  private async reindexarFonte(tipo: TipoBusca): Promise<number> {
    let ids: string[] = [];
    try {
      ids = await this.buscarIdsPublicos(tipo);
    } catch (e) {
      this.log.warn(`reindexarFonte(${tipo}): erro ao buscar ids — ${(e as Error).message}`);
      return 0;
    }
    let ok = 0;
    for (const id of ids) {
      try {
        ok += await this.processarItem(tipo, id);
      } catch (e) {
        this.log.warn(`reindexarFonte(${tipo}, ${id}): ${(e as Error).message}`);
      }
    }
    return ok;
  }

  private async buscarIdsPublicos(tipo: TipoBusca): Promise<string[]> {
    switch (tipo) {
      case 'noticia': {
        const rows = await this.prisma.db.noticia.findMany({ where: { publicado: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'documento': {
        const rows = await this.prisma.db.documento.findMany({
          where: { ativo: true, cadastro: { visibilidade: 'publico' } },
          select: { id: true },
        });
        return rows.map((r) => r.id);
      }
      case 'diario': {
        const rows = await this.prisma.db.diarioMateria.findMany({
          where: { edicao: { status: 'publicado' } },
          select: { id: true },
        });
        return rows.map((r) => r.id);
      }
      case 'servico': {
        const rows = await this.prisma.db.servico.findMany({ where: { publicado: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'secretaria': {
        const rows = await this.prisma.db.secretaria.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'cms': {
        const rows = await this.prisma.db.cmsPage.findMany({ where: { publicado: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'licitacao': {
        const rows = await this.prisma.db.licitacao.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'contrato': {
        const rows = await this.prisma.db.contrato.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'convenio': {
        const rows = await this.prisma.db.convenio.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'conselho': {
        const rows = await this.prisma.db.conselho.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      case 'concurso': {
        const rows = await this.prisma.db.concurso.findMany({ where: { ativo: true }, select: { id: true } });
        return rows.map((r) => r.id);
      }
      default:
        return [];
    }
  }

  // ─────────────────────────── cleanup de órfãos ───────────────────────────

  /**
   * Remove do índice itens que não existem mais (foram excluídos) ou que
   * perderam a visibilidade pública. Chama processarItem para cada entrada
   * do search_index — o processador faz DELETE se o item não for mais público.
   */
  async cleanupOrphansLocal(): Promise<number> {
    const tenantId = TenantContext.tenantId()!;
    // Busca todos os itens indexados do tenant
    const rows = await this.prisma.tx((t) =>
      t.$queryRaw<{ tipo: TipoBusca; ref_id: string }[]>`
        SELECT tipo, ref_id FROM search_index WHERE tenant_id = ${tenantId}::uuid
      `,
    );

    let removidos = 0;
    for (const { tipo, ref_id } of rows) {
      try {
        const resultado = await this.processarItem(tipo, ref_id);
        if (resultado === 0) removidos++;
      } catch {
        // ignora erros individuais — continua limpando os demais
      }
    }
    return removidos;
  }
}
