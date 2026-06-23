import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { IaIndexadorGlobalService } from './ia-indexador-global.service';
import {
  CriarConteudoGlobalDto,
  AtualizarConteudoGlobalDto,
  ListarConteudosGlobalQuery,
} from './ia-global.dto';
import { tsqueryOr } from './ia.prompts';

/** Representação de um conteúdo global de IA retornado pela API. */
export interface ItemConteudoGlobal {
  id: string;
  dominio: string;
  categoria: string | null;
  leiReferencia: string | null;
  fonteUrl: string | null;
  titulo: string;
  conteudo: string;
  tags: string[];
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

/**
 * CRUD do acervo GLOBAL de conhecimento da IA (ia_conteudos_global).
 *
 * Toda escrita roda via `prisma.platform()` para satisfazer a policy RLS
 * `app_is_platform()`. Leituras em SELECT USING true funcionam com qualquer
 * sessão, mas também usamos platform() por consistência e para não depender
 * de TenantContext (estas rotas são de plataforma, sem tenant resolvido).
 *
 * LGPD: apenas legislação/normas públicas — sem PII de cidadão.
 * Auditoria: toda ação sensível grava em audit_log via prisma.platform().
 */
@Injectable()
export class IaGlobalService {
  private readonly log = new Logger(IaGlobalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly indexadorGlobal: IaIndexadorGlobalService,
  ) {}

  // ================================================================ LISTAR

  /**
   * Lista conteúdos globais com filtros opcionais.
   * FTS via coluna `busca` quando `q` presente; filtro por domínio via ILIKE senão.
   */
  async listar(query: ListarConteudosGlobalQuery): Promise<ItemConteudoGlobal[]> {
    if (query.q?.trim()) {
      return this.listarComFts(query);
    }

    if (query.dominio) {
      // Filtro estruturado por domínio
      return this.prisma.platform().$queryRaw<ItemConteudoGlobal[]>`
        SELECT id::text AS id,
               dominio,
               categoria,
               lei_referencia AS "leiReferencia",
               fonte_url      AS "fonteUrl",
               titulo,
               conteudo,
               tags,
               ativo,
               criado_em    AS "criadoEm",
               atualizado_em AS "atualizadoEm"
        FROM ia_conteudos_global
        WHERE dominio ILIKE ${'%' + query.dominio + '%'}
        ORDER BY ativo DESC, atualizado_em DESC
        LIMIT 200`;
    }

    // Sem filtros: retorna todos (limitado a 200)
    return this.prisma.platform().$queryRaw<ItemConteudoGlobal[]>`
      SELECT id::text AS id,
             dominio,
             categoria,
             lei_referencia AS "leiReferencia",
             fonte_url      AS "fonteUrl",
             titulo,
             conteudo,
             tags,
             ativo,
             criado_em    AS "criadoEm",
             atualizado_em AS "atualizadoEm"
      FROM ia_conteudos_global
      ORDER BY ativo DESC, atualizado_em DESC
      LIMIT 200`;
  }

  /** Retorna um conteúdo global pelo id (para a edição no painel). */
  async obter(id: string): Promise<ItemConteudoGlobal> {
    const rows = await this.prisma.platform().$queryRaw<ItemConteudoGlobal[]>`
      SELECT id::text AS id,
             dominio,
             categoria,
             lei_referencia AS "leiReferencia",
             fonte_url      AS "fonteUrl",
             titulo,
             conteudo,
             tags,
             ativo,
             criado_em    AS "criadoEm",
             atualizado_em AS "atualizadoEm"
      FROM ia_conteudos_global
      WHERE id = ${id}::uuid
      LIMIT 1`;
    if (!rows.length) {
      throw new NotFoundException('Conteúdo global não encontrado.');
    }
    return rows[0];
  }

  /** FTS via coluna `busca` (tsvector GENERATED). */
  private async listarComFts(
    query: ListarConteudosGlobalQuery,
  ): Promise<ItemConteudoGlobal[]> {
    const expr = tsqueryOr(query.q ?? '');
    if (!expr) return [];

    try {
      const params: unknown[] = [expr];
      const conds: string[] = [`busca @@ to_tsquery('portuguese', $1)`];

      if (query.dominio) {
        params.push(`%${query.dominio}%`);
        conds.push(`dominio ILIKE $${params.length}`);
      }

      const where = conds.join(' AND ');
      const sql = `
        SELECT id::text AS id,
               dominio,
               categoria,
               lei_referencia AS "leiReferencia",
               fonte_url      AS "fonteUrl",
               titulo,
               conteudo,
               tags,
               ativo,
               criado_em    AS "criadoEm",
               atualizado_em AS "atualizadoEm"
        FROM ia_conteudos_global
        WHERE ${where}
        ORDER BY ts_rank(busca, to_tsquery('portuguese', $1)) DESC
        LIMIT 100`;

      return await this.prisma.platform().$queryRawUnsafe<ItemConteudoGlobal[]>(
        sql,
        ...params,
      );
    } catch (e) {
      this.log.warn(`FTS ia_conteudos_global falhou: ${String(e)}`);
      return [];
    }
  }

  // ================================================================ CRIAR

  async criar(
    dto: CriarConteudoGlobalDto,
    atorId?: string,
  ): Promise<ItemConteudoGlobal> {
    const rows = await this.prisma.platform().$queryRaw<ItemConteudoGlobal[]>`
      INSERT INTO ia_conteudos_global
        (dominio, categoria, lei_referencia, fonte_url, titulo, conteudo, tags, ativo)
      VALUES
        (${dto.dominio},
         ${dto.categoria ?? null},
         ${dto.leiReferencia ?? null},
         ${dto.fonteUrl ?? null},
         ${dto.titulo},
         ${dto.conteudo},
         ${dto.tags ?? []}::text[],
         ${dto.ativo ?? true})
      RETURNING
        id::text AS id,
        dominio,
        categoria,
        lei_referencia AS "leiReferencia",
        fonte_url      AS "fonteUrl",
        titulo,
        conteudo,
        tags,
        ativo,
        criado_em    AS "criadoEm",
        atualizado_em AS "atualizadoEm"`;

    const item = rows[0];

    await this.auditarPlataforma('IA_GLOBAL_CRIAR', item.id, atorId, {
      dominio: dto.dominio,
      tituloLen: dto.titulo.length,
    });

    // Indexação incremental best-effort
    if (item.ativo) {
      this.indexadorGlobal
        .indexarGlobal(item.id)
        .catch((e: unknown) =>
          this.log.warn(`Falha ao indexar global/${item.id}: ${String(e)}`),
        );
    }

    return item;
  }

  // ================================================================ ATUALIZAR

  async atualizar(
    id: string,
    dto: AtualizarConteudoGlobalDto,
    atorId?: string,
  ): Promise<ItemConteudoGlobal> {
    await this.garantirExiste(id);

    // Monta SET dinâmico — apenas campos presentes no DTO são atualizados
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (dto.dominio !== undefined) {
      params.push(dto.dominio);
      setClauses.push(`dominio = $${params.length}`);
    }
    if (dto.categoria !== undefined) {
      params.push(dto.categoria ?? null);
      setClauses.push(`categoria = $${params.length}`);
    }
    if (dto.leiReferencia !== undefined) {
      params.push(dto.leiReferencia ?? null);
      setClauses.push(`lei_referencia = $${params.length}`);
    }
    if (dto.fonteUrl !== undefined) {
      params.push(dto.fonteUrl ?? null);
      setClauses.push(`fonte_url = $${params.length}`);
    }
    if (dto.titulo !== undefined) {
      params.push(dto.titulo);
      setClauses.push(`titulo = $${params.length}`);
    }
    if (dto.conteudo !== undefined) {
      params.push(dto.conteudo);
      setClauses.push(`conteudo = $${params.length}`);
    }
    if (dto.tags !== undefined) {
      params.push(dto.tags);
      setClauses.push(`tags = $${params.length}::text[]`);
    }
    if (dto.ativo !== undefined) {
      params.push(dto.ativo);
      setClauses.push(`ativo = $${params.length}`);
    }

    if (setClauses.length === 0) {
      // Nenhum campo — busca e retorna o item atual sem UPDATE
      return this.garantirExiste(id);
    }

    params.push(id);
    const idParam = `$${params.length}`;

    const sql = `
      UPDATE ia_conteudos_global
         SET ${setClauses.join(', ')}
       WHERE id = ${idParam}::uuid
      RETURNING
        id::text AS id,
        dominio,
        categoria,
        lei_referencia AS "leiReferencia",
        fonte_url      AS "fonteUrl",
        titulo,
        conteudo,
        tags,
        ativo,
        criado_em    AS "criadoEm",
        atualizado_em AS "atualizadoEm"`;

    const rows = await this.prisma
      .platform()
      .$queryRawUnsafe<ItemConteudoGlobal[]>(sql, ...params);

    const item = rows[0];

    await this.auditarPlataforma('IA_GLOBAL_ATUALIZAR', id, atorId, {
      campos: Object.keys(dto),
    });

    // Reindexação incremental best-effort
    this.indexadorGlobal
      .indexarGlobal(id)
      .catch((e: unknown) =>
        this.log.warn(`Falha ao reindexar global/${id}: ${String(e)}`),
      );

    return item;
  }

  // ================================================================ EXCLUIR

  async excluir(id: string, atorId?: string): Promise<void> {
    await this.garantirExiste(id);

    await this.auditarPlataforma('IA_GLOBAL_EXCLUIR', id, atorId, {});

    // ON DELETE CASCADE remove os chunks automaticamente
    await this.prisma.platform().$executeRaw`
      DELETE FROM ia_conteudos_global WHERE id = ${id}::uuid`;
  }

  // ================================================================ STATUS

  /** Status do acervo global: contagem de chunks e config de embeddings. */
  async status(): Promise<{
    configurado: boolean;
    provider: string;
    chunks: number;
  }> {
    let chunks = 0;
    try {
      const rows = await this.prisma.platform().$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM ia_chunks_global`;
      chunks = Number(rows[0]?.total ?? 0);
    } catch (e) {
      this.log.warn(`Falha ao contar ia_chunks_global: ${String(e)}`);
    }

    return {
      configurado: this.embeddings.configurado,
      provider: this.embeddings.configurado ? this.embeddings.provider : 'none',
      chunks,
    };
  }

  // ================================================================ REINDEXAR

  /** Dispara reindexação global (síncrona — sem fila para simplificar; best-effort). */
  async reindexar(atorId?: string): Promise<{ enfileirado: boolean; motivo?: string }> {
    await this.auditarPlataforma('IA_GLOBAL_REINDEXAR', null, atorId, {
      configurado: this.embeddings.configurado,
    });

    if (!this.embeddings.configurado) {
      return {
        enfileirado: false,
        motivo: 'Embeddings não configurados (VOYAGE_API_KEY ou OPENAI_API_KEY ausente).',
      };
    }

    // Roda em background — não bloqueia a resposta HTTP
    this.indexadorGlobal
      .reindexarGlobal()
      .then((r) => this.log.log(`Reindexação global finalizada: ${JSON.stringify(r)}`))
      .catch((e: unknown) =>
        this.log.error(`Reindexação global falhou: ${String(e)}`),
      );

    return { enfileirado: true };
  }

  // ================================================================ HELPERS

  private async garantirExiste(id: string): Promise<ItemConteudoGlobal> {
    const rows = await this.prisma.platform().$queryRaw<ItemConteudoGlobal[]>`
      SELECT id::text AS id,
             dominio,
             categoria,
             lei_referencia AS "leiReferencia",
             fonte_url      AS "fonteUrl",
             titulo,
             conteudo,
             tags,
             ativo,
             criado_em    AS "criadoEm",
             atualizado_em AS "atualizadoEm"
      FROM ia_conteudos_global
      WHERE id = ${id}::uuid`;

    if (!rows[0]) {
      throw new NotFoundException('Conteúdo global de conhecimento não encontrado.');
    }
    return rows[0];
  }

  private async auditarPlataforma(
    acao: string,
    entidadeId: string | null,
    atorId: string | undefined,
    dados: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.platform().auditLog.create({
        data: {
          tenantId: null,
          atorId: atorId ?? null,
          acao,
          entidade: 'ia_conteudos_global',
          entidadeId,
          dados: dados as object,
        },
      });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${String(e)}`);
    }
  }
}
