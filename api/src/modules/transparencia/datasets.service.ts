import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { mascararDocumento } from './mascarar-doc.util';

const MAX_EXPORT = 50_000;

type Delegate = {
  findMany: (a: unknown) => Promise<any[]>;
  count: (a: unknown) => Promise<number>;
};

interface DatasetReg {
  delegate: (db: any) => Delegate;
  orderBy: unknown;
  filtros: (q: ConsultaDataset) => Record<string, unknown>;
  mascarar?: (row: any) => any;
}

export interface ConsultaDataset {
  ano?: number;
  categoria?: string;
  situacao?: string;
  vinculo?: string;
  tipo?: string;
  page?: number;
  pageSize?: number;
}

const ano = (q: ConsultaDataset) => (q.ano ? { exercicio: q.ano } : {});

/**
 * Registry dos datasets PNTP tabulares/documentais. Cada um ganha listagem
 * paginada + filtro + export CSV/JSON + defasagem (sync_log) automaticamente —
 * os 5 itens de verificação do PNTP de uma vez. A chave é o whitelist (evita
 * injeção de nome de tabela). Despesas/receitas/folha têm serviço próprio.
 */
export const DATASETS: Record<string, DatasetReg> = {
  diarias: {
    delegate: (d) => d.transpDiaria,
    orderBy: [{ exercicio: 'desc' }, { documento: 'asc' }],
    filtros: (q) => ({ ...ano(q) }),
  },
  obras: {
    delegate: (d) => d.transpObra,
    orderBy: [{ atualizadoEm: 'desc' }],
    filtros: (q) => ({ ...(q.situacao ? { situacao: q.situacao } : {}) }),
  },
  'divida-ativa': {
    delegate: (d) => d.transpDividaAtiva,
    orderBy: [{ exercicio: 'desc' }],
    filtros: (q) => ({ ...ano(q) }),
    mascarar: (r) => ({ ...r, inscritoDoc: mascararDocumento(r.inscritoDoc) }),
  },
  terceirizados: {
    delegate: (d) => d.transpTerceirizado,
    orderBy: [{ exercicio: 'desc' }, { nome: 'asc' }],
    filtros: (q) => ({ ...ano(q), ...(q.vinculo ? { vinculo: q.vinculo } : {}) }),
  },
  convenios: {
    delegate: (d) => d.transpConvenio,
    orderBy: [{ exercicio: 'desc' }],
    filtros: (q) => ({ ...ano(q), ...(q.tipo ? { tipo: q.tipo } : {}) }),
  },
  licitacoes: {
    delegate: (d) => d.transpLicitacao,
    orderBy: [{ exercicio: 'desc' }, { numero: 'asc' }],
    filtros: (q) => ({ ...ano(q) }),
  },
  contratos: {
    delegate: (d) => d.transpContrato,
    orderBy: [{ exercicio: 'desc' }],
    filtros: (q) => ({ ...ano(q) }),
    mascarar: (r) => ({ ...r, fornecedorDoc: mascararDocumento(r.fornecedorDoc) }),
  },
  documentos: {
    delegate: (d) => d.transpDocumento,
    orderBy: [{ exercicio: 'desc' }, { publicadoEm: 'desc' }],
    filtros: (q) => ({
      ...(q.categoria ? { categoria: q.categoria } : {}),
      ...ano(q),
    }),
  },
};

@Injectable()
export class DatasetsService {
  constructor(private readonly prisma: PrismaService) {}

  private reg(key: string): DatasetReg {
    const r = DATASETS[key];
    if (!r) throw new NotFoundException(`Conjunto de dados "${key}" não existe.`);
    return r;
  }

  async listar(key: string, q: ConsultaDataset) {
    const reg = this.reg(key);
    const where = reg.filtros(q);
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const delegate = reg.delegate(this.prisma.db);
    const [rows, total, ultimaAtualizacao] = await Promise.all([
      delegate.findMany({ where, orderBy: reg.orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      delegate.count({ where }),
      this.ultimaAtualizacao(key),
    ]);
    return {
      data: reg.mascarar ? rows.map(reg.mascarar) : rows,
      page,
      pageSize,
      total,
      ultimaAtualizacao,
    };
  }

  async exportar(key: string, q: ConsultaDataset) {
    const reg = this.reg(key);
    const rows = await reg.delegate(this.prisma.db).findMany({
      where: reg.filtros(q),
      orderBy: reg.orderBy,
      take: MAX_EXPORT,
    });
    return reg.mascarar ? rows.map(reg.mascarar) : rows;
  }

  async ultimaAtualizacao(dataset: string): Promise<Date | null> {
    const log = await this.prisma.db.transpSyncLog.findFirst({
      where: { dataset, status: 'ok' },
      orderBy: { criadoEm: 'desc' },
      select: { criadoEm: true },
    });
    return log?.criadoEm ?? null;
  }
}
