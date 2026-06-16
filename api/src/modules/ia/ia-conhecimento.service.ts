import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarConhecimentoDto, AtualizarConhecimentoDto } from './ia-conhecimento.dto';
import { tsqueryOr } from './ia.prompts';

export interface ItemConhecimento {
  id: string;
  pergunta: string;
  resposta: string;
  tags: string[];
  fixado: boolean;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

/**
 * Camada 3: Base de conhecimento curada do assistente de IA, por tenant.
 * Toda escrita é RLS-scoped via prisma.db; FTS usa a coluna `busca` GENERATED
 * do banco (tsvector) via raw query — o Prisma Client não expõe colunas GENERATED.
 * LGPD: contém apenas informação institucional pública; sem PII de cidadão.
 */
@Injectable()
export class IaConhecimentoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca FTS sobre a coluna `busca` (tsvector GENERATED no banco).
   * Retorna até `limite` itens ativos ordenados por relevância.
   */
  async buscar(q: string, limite = 4): Promise<{ pergunta: string; resposta: string }[]> {
    const expr = tsqueryOr(q ?? '');
    if (!expr) return [];
    try {
      return await this.prisma.db.$queryRaw<{ pergunta: string; resposta: string }[]>`
        SELECT pergunta, resposta
        FROM ia_conhecimento
        WHERE ativo = true
          AND busca @@ to_tsquery('portuguese', ${expr})
        ORDER BY ts_rank(busca, to_tsquery('portuguese', ${expr})) DESC
        LIMIT ${limite}`;
    } catch {
      // Degrada silenciosamente se a coluna/tabela não estiver disponível
      return [];
    }
  }

  /**
   * Itens fixados e ativos — sempre injetados no contexto independentemente
   * da pergunta (respostas prioritárias cadastradas pelo gestor).
   */
  async fixados(): Promise<{ pergunta: string; resposta: string }[]> {
    try {
      return await this.prisma.db.iaConhecimento.findMany({
        where: { ativo: true, fixado: true },
        select: { pergunta: true, resposta: true },
        orderBy: { atualizadoEm: 'desc' },
      });
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------- CRUD admin

  /** Lista todos os itens do tenant (paginação simples). */
  async listar(): Promise<ItemConhecimento[]> {
    return this.prisma.db.iaConhecimento.findMany({
      orderBy: [{ fixado: 'desc' }, { atualizadoEm: 'desc' }],
    }) as Promise<ItemConhecimento[]>;
  }

  /** Cria um novo item; audita a ação. */
  async criar(dto: CriarConhecimentoDto, userId?: string): Promise<ItemConhecimento> {
    const item = await this.prisma.db.iaConhecimento.create({
      data: {
        tenantId: TenantContext.tenantId()!,
        pergunta: dto.pergunta,
        resposta: dto.resposta,
        tags: dto.tags ?? [],
        fixado: dto.fixado ?? false,
        ativo: dto.ativo ?? true,
        criadoPor: userId ?? null,
      },
    });
    await this.auditar('IA_CONHECIMENTO_CRIAR', item.id, { perguntaLen: dto.pergunta.length });
    return item as ItemConhecimento;
  }

  /** Atualiza um item existente; lança NotFoundException se não pertencer ao tenant. */
  async atualizar(id: string, dto: AtualizarConhecimentoDto, userId?: string): Promise<ItemConhecimento> {
    await this.garantirExiste(id);
    const item = await this.prisma.db.iaConhecimento.update({
      where: { id },
      data: {
        ...(dto.pergunta !== undefined && { pergunta: dto.pergunta }),
        ...(dto.resposta !== undefined && { resposta: dto.resposta }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.fixado !== undefined && { fixado: dto.fixado }),
        ...(dto.ativo !== undefined && { ativo: dto.ativo }),
      },
    });
    await this.auditar('IA_CONHECIMENTO_ATUALIZAR', id, { campos: Object.keys(dto) });
    return item as ItemConhecimento;
  }

  /** Exclui (hard delete) um item do tenant; audita antes de excluir. */
  async excluir(id: string): Promise<void> {
    await this.garantirExiste(id);
    await this.auditar('IA_CONHECIMENTO_EXCLUIR', id, {});
    await this.prisma.db.iaConhecimento.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- helpers

  private async garantirExiste(id: string): Promise<void> {
    const item = await this.prisma.db.iaConhecimento.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item de conhecimento não encontrado.');
  }

  private async auditar(acao: string, entidadeId: string, dados: Record<string, unknown>): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.tenantId() ?? null,
        atorId: TenantContext.get().userId ?? null,
        acao,
        entidade: 'ia_conhecimento',
        entidadeId,
        dados: dados as object,
      },
    });
  }
}
