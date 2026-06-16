import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ConsultaQuery, Dataset } from './transparencia.types';
import { mascararDocumento, mascararMatricula } from './mascarar-doc.util';

const MAX_EXPORT = 50_000; // teto de linhas por exportação de dados abertos
const MAX_INGEST = 5_000; // por chamada de ETL — cargas maiores: fracionar no n8n

// Projeção pública da folha (parecer DPO): só estas colunas saem do banco.
const FOLHA_SELECT = {
  exercicio: true,
  mes: true,
  matricula: true,
  nomeServidor: true,
  nomeSuprimido: true,
  cargo: true,
  vinculo: true,
  orgao: true,
  remuneracaoBruta: true,
  descontos: true,
  remuneracaoLiquida: true,
} as const;

@Injectable()
export class TransparenciaService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------------- DESPESAS
  private despesaWhere(q: ConsultaQuery) {
    const where: Record<string, unknown> = {};
    if (q.ano) where.exercicio = q.ano;
    if (q.orgao) where.orgao = { contains: q.orgao, mode: 'insensitive' };
    if (q.credor) where.credorNome = { contains: q.credor, mode: 'insensitive' };
    return where;
  }

  // mascara o doc do credor na SAÍDA pública (original fica intacto no banco)
  private mascararDespesa<T extends { credorDoc: string | null }>(d: T) {
    return { ...d, credorDoc: mascararDocumento(d.credorDoc) };
  }

  async listarDespesas(q: ConsultaQuery) {
    const where = this.despesaWhere(q);
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const [rows, total, ultimaAtualizacao] = await Promise.all([
      this.prisma.db.transpDespesa.findMany({
        where,
        orderBy: [{ exercicio: 'desc' }, { dataEmpenho: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.transpDespesa.count({ where }),
      this.ultimaAtualizacao('despesas'),
    ]);
    return { data: rows.map((d) => this.mascararDespesa(d)), page, pageSize, total, ultimaAtualizacao };
  }

  /** Conjunto completo para exportação (CSV/JSON), com teto de segurança. */
  async exportarDespesas(q: ConsultaQuery) {
    const rows = await this.prisma.db.transpDespesa.findMany({
      where: this.despesaWhere(q),
      orderBy: [{ exercicio: 'desc' }, { empenho: 'asc' }],
      take: MAX_EXPORT,
    });
    return rows.map((d) => this.mascararDespesa(d));
  }

  // ------------------------------------------------------------ FOLHA
  private folhaWhere(q: ConsultaQuery) {
    const where: Record<string, unknown> = {};
    if (q.ano) where.exercicio = q.ano;
    if (q.mes) where.mes = q.mes;
    if (q.orgao) where.orgao = { contains: q.orgao, mode: 'insensitive' };
    if (q.cargo) where.cargo = { contains: q.cargo, mode: 'insensitive' };
    return where;
  }

  // projeção pública: matrícula mascarada, nome suprimido por medida protetiva
  private projetarFolha(f: {
    exercicio: number;
    mes: number;
    matricula: string;
    nomeServidor: string | null;
    nomeSuprimido: boolean;
    cargo: string | null;
    vinculo: string | null;
    orgao: string | null;
    remuneracaoBruta: unknown;
    descontos: unknown;
    remuneracaoLiquida: unknown;
  }) {
    return {
      exercicio: f.exercicio,
      mes: f.mes,
      matriculaMascarada: mascararMatricula(f.matricula),
      nomeServidor: f.nomeSuprimido ? 'NOME SUPRIMIDO - MEDIDA PROTETIVA' : f.nomeServidor,
      cargo: f.cargo,
      vinculo: f.vinculo,
      orgao: f.orgao,
      remuneracaoBruta: f.remuneracaoBruta,
      descontos: f.descontos,
      remuneracaoLiquida: f.remuneracaoLiquida,
    };
  }

  async listarFolha(q: ConsultaQuery) {
    const where = this.folhaWhere(q);
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const [rows, total, ultimaAtualizacao] = await Promise.all([
      this.prisma.db.transpFolha.findMany({
        where,
        orderBy: [{ exercicio: 'desc' }, { mes: 'desc' }, { nomeServidor: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: FOLHA_SELECT,
      }),
      this.prisma.db.transpFolha.count({ where }),
      this.ultimaAtualizacao('folha'),
    ]);
    return { data: rows.map((f) => this.projetarFolha(f)), page, pageSize, total, ultimaAtualizacao };
  }

  async exportarFolha(q: ConsultaQuery) {
    const rows = await this.prisma.db.transpFolha.findMany({
      where: this.folhaWhere(q),
      orderBy: [{ exercicio: 'desc' }, { mes: 'desc' }],
      take: MAX_EXPORT,
      select: FOLHA_SELECT,
    });
    return rows.map((f) => this.projetarFolha(f));
  }

  // ----------------------------------------------------------- RECEITAS
  private receitaWhere(q: ConsultaQuery) {
    const where: Record<string, unknown> = {};
    if (q.ano) where.exercicio = q.ano;
    return where;
  }

  async listarReceitas(q: ConsultaQuery) {
    const where = this.receitaWhere(q);
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const [data, total, ultimaAtualizacao] = await Promise.all([
      this.prisma.db.transpReceita.findMany({
        where,
        orderBy: [{ exercicio: 'desc' }, { codigo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.transpReceita.count({ where }),
      this.ultimaAtualizacao('receitas'),
    ]);
    return { data, page, pageSize, total, ultimaAtualizacao };
  }

  async exportarReceitas(q: ConsultaQuery) {
    return this.prisma.db.transpReceita.findMany({
      where: this.receitaWhere(q),
      orderBy: [{ exercicio: 'desc' }, { codigo: 'asc' }],
      take: MAX_EXPORT,
    });
  }

  // -------------------------------------------------------- DEFASAGEM
  /** Data da última sincronização bem-sucedida de um conjunto (LC 131). */
  async ultimaAtualizacao(dataset: Dataset): Promise<Date | null> {
    const log = await this.prisma.db.transpSyncLog.findFirst({
      where: { dataset, status: 'ok' },
      orderBy: { criadoEm: 'desc' },
      select: { criadoEm: true },
    });
    return log?.criadoEm ?? null;
  }

  // --------------------------------------------------- INGESTÃO (ETL)
  /**
   * Ingestão idempotente: faz UPSERT por chave natural, então reprocessar a
   * mesma carga não duplica. Roda dentro do TenantContext (RLS). Registra a
   * sincronização no log (rastreabilidade + defasagem).
   */
  async ingerir(
    dataset: Dataset,
    origem: string | undefined,
    registros: Record<string, unknown>[],
  ): Promise<{ dataset: Dataset; registros: number }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new Error('Ingestão exige contexto de tenant.');
    if (registros.length > MAX_INGEST) {
      throw new BadRequestException(
        `Lote grande demais (${registros.length} > ${MAX_INGEST}). Fracione a carga no ETL.`,
      );
    }

    // ATÔMICO: todos os UPSERTs + o log de sync numa transação só (all-or-nothing).
    // Cargas grandes devem ser fracionadas pelo ETL (n8n) antes de chamar.
    const count = await this.prisma.tx(async (tx) => {
    let count = 0;
    if (dataset === 'despesas') {
      for (const r of registros) {
        const m = this.mapDespesa(r, origem);
        await tx.transpDespesa.upsert({
          where: {
            tenantId_exercicio_empenho: {
              tenantId,
              exercicio: m.exercicio,
              empenho: m.empenho,
            },
          },
          create: { tenantId, ...m },
          update: m,
        });
        count++;
      }
    } else if (dataset === 'receitas') {
      for (const r of registros) {
        const m = this.mapReceita(r, origem);
        await tx.transpReceita.upsert({
          where: {
            tenantId_exercicio_codigo_dataLancamento: {
              tenantId,
              exercicio: m.exercicio,
              codigo: m.codigo,
              dataLancamento: m.dataLancamento,
            },
          },
          create: { tenantId, ...m },
          update: m,
        });
        count++;
      }
    } else {
      for (const r of registros) {
        const m = this.mapFolha(r, origem);
        await tx.transpFolha.upsert({
          where: {
            tenantId_exercicio_mes_matricula: {
              tenantId,
              exercicio: m.exercicio,
              mes: m.mes,
              matricula: m.matricula,
            },
          },
          create: { tenantId, ...m },
          update: m,
        });
        count++;
      }
    }

      await tx.transpSyncLog.create({
        data: { tenantId, dataset, origem, registros: count, status: 'ok' },
      });
      return count;
    });
    return { dataset, registros: count };
  }

  // ------------------------------------------------- coerção canônica
  private num(v: unknown): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  private date(v: unknown): Date | null {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  private mapDespesa(r: Record<string, unknown>, origem?: string) {
    return {
      exercicio: Number(r.exercicio),
      empenho: String(r.empenho),
      orgao: (r.orgao as string) ?? null,
      unidade: (r.unidade as string) ?? null,
      funcao: (r.funcao as string) ?? null,
      elemento: (r.elemento as string) ?? null,
      modalidade: (r.modalidade as string) ?? null,
      credorNome: (r.credor_nome as string) ?? null,
      credorDoc: (r.credor_doc as string) ?? null,
      fase: (r.fase as string) ?? null,
      valorEmpenhado: this.num(r.valor_empenhado),
      valorLiquidado: this.num(r.valor_liquidado),
      valorPago: this.num(r.valor_pago),
      dataEmpenho: this.date(r.data_empenho),
      fonteOrigem: (r.fonte_origem as string) ?? origem ?? null,
    };
  }

  private mapReceita(r: Record<string, unknown>, origem?: string) {
    return {
      exercicio: Number(r.exercicio),
      codigo: String(r.codigo),
      descricao: (r.descricao as string) ?? null,
      categoria: (r.categoria as string) ?? null,
      fonte: (r.fonte as string) ?? null,
      valorPrevisto: this.num(r.valor_previsto),
      valorArrecadado: this.num(r.valor_arrecadado),
      dataLancamento: this.date(r.data_lancamento) ?? new Date(),
      fonteOrigem: (r.fonte_origem as string) ?? origem ?? null,
    };
  }

  private mapFolha(r: Record<string, unknown>, origem?: string) {
    return {
      exercicio: Number(r.exercicio),
      mes: Number(r.mes),
      matricula: String(r.matricula),
      nomeServidor: (r.nome_servidor as string) ?? null,
      cargo: (r.cargo as string) ?? null,
      vinculo: (r.vinculo as string) ?? null,
      orgao: (r.orgao as string) ?? null,
      remuneracaoBruta: this.num(r.remuneracao_bruta),
      descontos: this.num(r.descontos),
      remuneracaoLiquida: this.num(r.remuneracao_liquida),
      fonteOrigem: (r.fonte_origem as string) ?? origem ?? null,
    };
  }
}
