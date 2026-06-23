import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EscopoSecretariaService } from '../../common/escopo/escopo-secretaria.service';
import { IaIndexadorService } from './ia-indexador.service';
import { CriarConteudoDto, AtualizarConteudoDto } from './ia-conteudos.dto';
import { tsqueryOr } from './ia.prompts';

export interface ItemConteudo {
  id: string;
  tenantId: string;
  secretariaId: string | null;
  categoria: string | null;
  titulo: string;
  conteudo: string;
  tags: string[];
  publico: boolean;
  ativo: boolean;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

interface FiltrosListagem {
  categoria?: string;
  secretariaId?: string;
  q?: string;
}

/**
 * CRUD de conteúdos longos de conhecimento (ia_conteudos).
 * Diferente de ia_conhecimento (pares Q&A curtos), aqui ficam artigos,
 * regimentos, normas, eventos e qualquer corpus longo de texto.
 *
 * Escopo de secretaria (ADR-0005 Fase 4):
 *  - admin_prefeitura / ti → sem escopo; vê e gerencia tudo.
 *  - gestor / servidor   → limitados à secretaria da lotação.
 *    - sem lotação → lista vazia; criação proibida (403).
 *
 * Indexação incremental: CRIAR/ATUALIZAR dispara indexarConteudo() em
 * best-effort/async se o item ficar ativo+publico. EXCLUIR remove os chunks.
 *
 * LGPD: contém apenas conteúdo institucional público; sem PII de cidadão.
 */
@Injectable()
export class IaConteudosService {
  private readonly log = new Logger(IaConteudosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: EscopoSecretariaService,
    private readonly indexador: IaIndexadorService,
  ) {}

  // ================================================================ LISTAR

  /**
   * Lista conteúdos do tenant com filtros opcionais.
   * Aplica escopo de secretaria para gestor/servidor.
   */
  async listar(
    filtros: FiltrosListagem,
    userId?: string,
    role?: string,
  ): Promise<ItemConteudo[]> {
    const escopoId = await this.escopo.resolver(userId, role);

    // gestor/servidor sem lotação → lista vazia (sem secretaria = sem conteúdo gerenciável)
    if (escopoId === null) return [];

    // FTS quando há termo de busca
    if (filtros.q?.trim()) {
      return this.listarComFts(filtros, escopoId);
    }

    // Filtros estruturados via Prisma Client
    const secretariaFiltro = escopoId !== undefined
      ? escopoId // gestor/servidor: forçado ao escopo
      : filtros.secretariaId ?? undefined; // admin/ti: usa filtro do query param

    return this.prisma.db.iaConteudo.findMany({
      where: {
        ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
        ...(secretariaFiltro !== undefined ? { secretariaId: secretariaFiltro } : {}),
      },
      orderBy: [{ ativo: 'desc' }, { atualizadoEm: 'desc' }],
    }) as Promise<ItemConteudo[]>;
  }

  /** FTS via raw query sobre coluna `busca` (tsvector GENERATED). */
  private async listarComFts(
    filtros: FiltrosListagem,
    escopoId: string | null | undefined,
  ): Promise<ItemConteudo[]> {
    const expr = tsqueryOr(filtros.q ?? '');
    if (!expr) return [];

    // escopoId !== undefined → gestor/servidor com lotação → filtra pela secretaria
    // escopoId === undefined → admin/ti → usa filtro do query param (se existir)
    const secretariaIdEfetivo: string | null =
      escopoId !== undefined ? escopoId : (filtros.secretariaId ?? null);

    try {
      // Usamos $queryRawUnsafe para montar condicionalmente as cláusulas SQL extras.
      // Os valores parametrizados são passados como $N — sem interpolação de string.
      // O `expr` vem de tsqueryOr() que sanitiza os termos (alphanum + |).
      const params: unknown[] = [expr];
      const conds: string[] = [
        `busca @@ to_tsquery('portuguese', $1)`,
      ];

      if (filtros.categoria) {
        params.push(filtros.categoria);
        conds.push(`categoria = $${params.length}`);
      }
      if (secretariaIdEfetivo !== null) {
        params.push(secretariaIdEfetivo);
        conds.push(`secretaria_id = $${params.length}::uuid`);
      }

      const where = conds.join(' AND ');
      const sql = `
        SELECT id, tenant_id AS "tenantId", secretaria_id AS "secretariaId",
               categoria, titulo, conteudo, tags, publico, ativo,
               vigencia_inicio AS "vigenciaInicio", vigencia_fim AS "vigenciaFim",
               criado_em AS "criadoEm", atualizado_em AS "atualizadoEm"
        FROM ia_conteudos
        WHERE ${where}
        ORDER BY ts_rank(busca, to_tsquery('portuguese', $1)) DESC
        LIMIT 50`;

      return await this.prisma.db.$queryRawUnsafe<ItemConteudo[]>(sql, ...params);
    } catch (e) {
      this.log.warn(`FTS ia_conteudos falhou: ${String(e)}`);
      return [];
    }
  }

  // ================================================================ OBTER

  async obter(id: string, userId?: string, role?: string): Promise<ItemConteudo> {
    const item = await this.garantirExiste(id);
    await this.validarEscopo(item, userId, role, 'ler');
    return item;
  }

  // ================================================================ CRIAR

  async criar(
    dto: CriarConteudoDto,
    userId?: string,
    role?: string,
  ): Promise<ItemConteudo> {
    const escopoId = await this.escopo.resolver(userId, role);

    // gestor/servidor sem lotação → não pode criar
    if (escopoId === null) {
      throw new ForbiddenException(
        'Sem lotação definida. Contate o administrador para vincular à secretaria.',
      );
    }

    // Para gestor/servidor, a secretariaId é sempre a do escopo (ignora o que vieram no DTO)
    const secretariaIdFinal =
      escopoId !== undefined ? escopoId : (dto.secretariaId ?? null);

    const item = await this.prisma.db.iaConteudo.create({
      data: {
        tenantId: TenantContext.tenantId()!,
        secretariaId: secretariaIdFinal,
        categoria: dto.categoria ?? null,
        titulo: dto.titulo,
        conteudo: dto.conteudo,
        tags: dto.tags ?? [],
        publico: dto.publico ?? true,
        ativo: dto.ativo ?? true,
        vigenciaInicio: dto.vigenciaInicio ? new Date(dto.vigenciaInicio) : null,
        vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : null,
      },
    });

    await this.auditar('IA_CONTEUDO_CRIAR', item.id, {
      tituloLen: dto.titulo.length,
      secretariaId: secretariaIdFinal,
    });

    // Indexação incremental best-effort (async — não derruba o request)
    this.dispararIndexacao(item as ItemConteudo);

    return item as ItemConteudo;
  }

  // ================================================================ ATUALIZAR

  async atualizar(
    id: string,
    dto: AtualizarConteudoDto,
    userId?: string,
    role?: string,
  ): Promise<ItemConteudo> {
    const existente = await this.garantirExiste(id);
    await this.validarEscopo(existente, userId, role, 'editar');

    const item = await this.prisma.db.iaConteudo.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo }),
        ...(dto.conteudo !== undefined && { conteudo: dto.conteudo }),
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.secretariaId !== undefined && { secretariaId: dto.secretariaId }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.publico !== undefined && { publico: dto.publico }),
        ...(dto.ativo !== undefined && { ativo: dto.ativo }),
        ...(dto.vigenciaInicio !== undefined && {
          vigenciaInicio: dto.vigenciaInicio ? new Date(dto.vigenciaInicio) : null,
        }),
        ...(dto.vigenciaFim !== undefined && {
          vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : null,
        }),
      },
    });

    await this.auditar('IA_CONTEUDO_ATUALIZAR', id, { campos: Object.keys(dto) });

    // Indexação/remoção incremental best-effort
    this.dispararIndexacao(item as ItemConteudo);

    return item as ItemConteudo;
  }

  // ================================================================ EXCLUIR

  async excluir(id: string, userId?: string, role?: string): Promise<void> {
    const existente = await this.garantirExiste(id);
    await this.validarEscopo(existente, userId, role, 'excluir');
    await this.auditar('IA_CONTEUDO_EXCLUIR', id, {});
    await this.prisma.db.iaConteudo.delete({ where: { id } });

    // Remove chunks do vetorial (best-effort — não derruba o request)
    this.removerChunks(id);
  }

  // ================================================================ INDEXACAO

  /**
   * Dispara indexação ou remoção de chunks de forma assíncrona (best-effort).
   * Se o item estiver ativo+publico → indexa; caso contrário → remove chunks.
   */
  private dispararIndexacao(item: ItemConteudo): void {
    const devIndexar = item.ativo && item.publico;
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return;

    if (devIndexar) {
      // Indexação incremental: best-effort, não propaga erro para o request
      this.indexador
        .indexarConteudo(tenantId, item.id)
        .catch((e: unknown) =>
          this.log.warn(`Falha ao indexar conteudo ${item.id}: ${String(e)}`),
        );
    } else {
      this.removerChunks(item.id);
    }
  }

  /** Remove chunks vetoriais de um conteúdo desativado/não-público ou excluído. */
  private removerChunks(id: string): void {
    this.prisma.db
      .$executeRaw`DELETE FROM ia_chunks WHERE fonte = 'conteudo' AND ref_id = ${id}`
      .catch((e: unknown) =>
        this.log.warn(`Falha ao remover chunks do conteudo ${id}: ${String(e)}`),
      );
  }

  // ================================================================ HELPERS

  private async garantirExiste(id: string): Promise<ItemConteudo> {
    const item = await this.prisma.db.iaConteudo.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Conteúdo de conhecimento não encontrado.');
    return item as ItemConteudo;
  }

  /**
   * Valida que o usuário tem acesso ao item conforme o escopo de secretaria.
   * admin_prefeitura / ti → acesso irrestrito.
   * gestor / servidor     → somente se o item pertencer à secretaria do escopo.
   */
  private async validarEscopo(
    item: ItemConteudo,
    userId?: string,
    role?: string,
    acao = 'acessar',
  ): Promise<void> {
    const escopoId = await this.escopo.resolver(userId, role);
    if (escopoId === undefined) return; // admin/ti: sem restrição
    if (escopoId === null || item.secretariaId !== escopoId) {
      throw new ForbiddenException(
        `Sem permissão para ${acao} este conteúdo (fora da secretaria de lotação).`,
      );
    }
  }

  private async auditar(
    acao: string,
    entidadeId: string,
    dados: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.tenantId() ?? null,
        atorId: TenantContext.get().userId ?? null,
        acao,
        entidade: 'ia_conteudos',
        entidadeId,
        dados: dados as object,
      },
    });
  }
}
