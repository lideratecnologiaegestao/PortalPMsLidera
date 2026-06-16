import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Consultas PRECISAS sobre a carga APLIC (execução da despesa), via SQL
 * determinístico sobre as tabelas aplic_* (RLS por tenant). É a fonte das
 * respostas fiscais do assistente — NUNCA embeddings (não se alucina cifra).
 *
 * LGPD: a identificação do credor é MASCARADA quando pessoa física (CPF);
 * CNPJ é público. Nenhum CPF em claro sai daqui.
 */
@Injectable()
export class AplicConsultaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Totais empenhado/liquidado/pago do exercício (ou geral se omitido). */
  async resumo(exercicio?: number) {
    const r = await this.prisma.db.$queryRaw<
      { emp_qtd: bigint; empenhado: string; liq_qtd: bigint; liquidado: string; pag_qtd: bigint; pago: string; credores: bigint }[]
    >`
      SELECT
        (SELECT count(*)               FROM aplic_empenho    e WHERE (${exercicio ?? null}::int IS NULL OR e.exercicio = ${exercicio ?? null})) AS emp_qtd,
        (SELECT coalesce(sum(emp_valor),0) FROM aplic_empenho e WHERE (${exercicio ?? null}::int IS NULL OR e.exercicio = ${exercicio ?? null})) AS empenhado,
        (SELECT count(*)               FROM aplic_liquidacao l WHERE (${exercicio ?? null}::int IS NULL OR l.exercicio = ${exercicio ?? null})) AS liq_qtd,
        (SELECT coalesce(sum(liq_valor),0) FROM aplic_liquidacao l WHERE (${exercicio ?? null}::int IS NULL OR l.exercicio = ${exercicio ?? null})) AS liquidado,
        (SELECT count(*)               FROM aplic_pagamento  p WHERE (${exercicio ?? null}::int IS NULL OR p.exercicio = ${exercicio ?? null})) AS pag_qtd,
        (SELECT coalesce(sum(pgto_valor),0) FROM aplic_pagamento p WHERE (${exercicio ?? null}::int IS NULL OR p.exercicio = ${exercicio ?? null})) AS pago,
        (SELECT count(*)               FROM aplic_credor) AS credores`;
    const row = r[0];
    return {
      exercicio: exercicio ?? null,
      empenhado: num(row?.empenhado),
      liquidado: num(row?.liquidado),
      pago: num(row?.pago),
      empenhos: Number(row?.emp_qtd ?? 0),
      liquidacoes: Number(row?.liq_qtd ?? 0),
      pagamentos: Number(row?.pag_qtd ?? 0),
      credores: Number(row?.credores ?? 0),
    };
  }

  /** Maiores credores por valor empenhado ou liquidado (credor mascarado). */
  async maioresCredores(opts: { exercicio?: number; por?: 'empenhado' | 'liquidado'; limite?: number } = {}) {
    const exercicio = opts.exercicio ?? null;
    const limite = Math.min(Math.max(opts.limite ?? 10, 1), 50);
    const por = opts.por === 'liquidado' ? 'liquidado' : 'empenhado';

    const rows =
      por === 'empenhado'
        ? await this.prisma.db.$queryRaw<CredorAgg[]>`
            SELECT e.credor_ident AS ident, max(c.nome) AS nome, max(c.tipo_pessoa) AS tipo,
                   count(*)::int AS qtd, coalesce(sum(e.emp_valor),0) AS total
            FROM aplic_empenho e
            LEFT JOIN aplic_credor c ON c.identificacao = e.credor_ident
            WHERE e.credor_ident IS NOT NULL AND (${exercicio}::int IS NULL OR e.exercicio = ${exercicio})
            GROUP BY e.credor_ident ORDER BY total DESC LIMIT ${limite}`
        : await this.prisma.db.$queryRaw<CredorAgg[]>`
            SELECT e.credor_ident AS ident, max(c.nome) AS nome, max(c.tipo_pessoa) AS tipo,
                   count(*)::int AS qtd, coalesce(sum(l.liq_valor),0) AS total
            FROM aplic_liquidacao l
            JOIN aplic_empenho e ON e.org_codigo = l.org_codigo AND e.unor_codigo = l.unor_codigo AND e.emp_numero = l.emp_numero
            LEFT JOIN aplic_credor c ON c.identificacao = e.credor_ident
            WHERE e.credor_ident IS NOT NULL AND (${exercicio}::int IS NULL OR l.exercicio = ${exercicio})
            GROUP BY e.credor_ident ORDER BY total DESC LIMIT ${limite}`;

    return {
      exercicio: opts.exercicio ?? null,
      criterio: por,
      credores: rows.map((r) => ({
        credor: mascararIdent(r.ident, r.tipo),
        nome: r.nome ?? null,
        qtd: Number(r.qtd),
        total: num(r.total),
      })),
    };
  }

  /** Empenhado/liquidado/pago de um credor buscado por nome ou CPF/CNPJ. */
  async porCredor(termo: string, exercicio?: number) {
    const exerc = exercicio ?? null;
    const digitos = (termo ?? '').replace(/\D/g, '');
    const like = `%${(termo ?? '').trim()}%`;
    // 1) busca por nome
    let candidatos = await this.prisma.db.$queryRaw<
      { identificacao: string; nome: string | null; tipo_pessoa: string | null }[]
    >`
      SELECT identificacao, nome, tipo_pessoa FROM aplic_credor
      WHERE nome ILIKE ${like}
      ORDER BY nome LIMIT 5`;
    // 2) se nada e o termo parece CPF/CNPJ, busca por dígitos
    if (candidatos.length === 0 && digitos.length >= 3) {
      candidatos = await this.buscarPorDigitos(digitos);
    }

    const resultados: Array<Record<string, unknown>> = [];
    for (const c of candidatos.slice(0, 5)) {
      const ag = await this.agregadosDoCredor(c.identificacao, exerc);
      resultados.push({
        credor: mascararIdent(c.identificacao, c.tipo_pessoa),
        nome: c.nome ?? null,
        ...ag,
      });
    }
    return { exercicio: exercicio ?? null, termo, resultados };
  }

  /** Situação de um empenho: empenhado, liquidado e pago da cadeia. */
  async situacaoEmpenho(numero: string, exercicio?: number) {
    const exerc = exercicio ?? null;
    const empenhos = await this.prisma.db.$queryRaw<
      { org_codigo: string; unor_codigo: string; emp_numero: string; emp_data: Date | null; emp_valor: string; credor_ident: string | null; descricao: string | null; tipo_pessoa: string | null; nome: string | null; exercicio: number }[]
    >`
      SELECT e.org_codigo, e.unor_codigo, e.emp_numero, e.emp_data, e.emp_valor,
             e.credor_ident, e.descricao, e.exercicio, c.tipo_pessoa, c.nome
      FROM aplic_empenho e
      LEFT JOIN aplic_credor c ON c.identificacao = e.credor_ident
      WHERE e.emp_numero = ${numero} AND (${exerc}::int IS NULL OR e.exercicio = ${exerc})
      LIMIT 10`;

    const itens: Array<Record<string, unknown>> = [];
    for (const e of empenhos) {
      const liq = await this.prisma.db.$queryRaw<{ total: string }[]>`
        SELECT coalesce(sum(liq_valor),0) AS total FROM aplic_liquidacao
        WHERE org_codigo=${e.org_codigo} AND unor_codigo=${e.unor_codigo} AND emp_numero=${e.emp_numero}`;
      const pago = await this.prisma.db.$queryRaw<{ total: string }[]>`
        SELECT coalesce(sum(pgto_valor),0) AS total FROM (
          SELECT DISTINCT pg.id, pg.pgto_valor
          FROM aplic_pagamento pg
          JOIN aplic_pagamento_liquidacao b ON b.pgto_numero = pg.pgto_numero
          WHERE b.org_codigo=${e.org_codigo} AND b.unor_codigo=${e.unor_codigo} AND b.emp_numero=${e.emp_numero}
        ) x`;
      const empenhado = num(e.emp_valor);
      const liquidado = num(liq[0]?.total);
      const p = num(pago[0]?.total);
      itens.push({
        empenho: e.emp_numero,
        exercicio: e.exercicio,
        data: e.emp_data ? e.emp_data.toISOString().slice(0, 10) : null,
        credor: mascararIdent(e.credor_ident, e.tipo_pessoa),
        credorNome: e.nome ?? null,
        descricao: e.descricao ?? null,
        empenhado,
        liquidado,
        pago: p,
        saldoALiquidar: round2(empenhado - liquidado),
        saldoAPagar: round2(liquidado - p),
      });
    }
    return { numero, itens };
  }

  /**
   * Lista pública de empenhos (com liquidado/pago por empenho), paginada e
   * pesquisável. Credor mascarado (CPF) — uso público/transparência.
   */
  async listarEmpenhos(opts: { exercicio?: number; q?: string; page?: number; pageSize?: number } = {}) {
    const exercicio = opts.exercicio ?? null;
    const qParam = (opts.q ?? '').trim() || null;
    const qLike = qParam ? `%${qParam}%` : null;
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const itens = await this.empenhosQuery(exercicio, qParam, qLike, pageSize, offset);
    const totalRows = await this.prisma.db.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM aplic_empenho e
      LEFT JOIN aplic_credor c ON c.identificacao = e.credor_ident
      WHERE (${exercicio}::int IS NULL OR e.exercicio = ${exercicio})
        AND (${qParam}::text IS NULL OR e.descricao ILIKE ${qLike} OR e.emp_numero ILIKE ${qLike} OR coalesce(c.nome,'') ILIKE ${qLike})`;
    return { page, pageSize, total: Number(totalRows[0]?.total ?? 0), exercicio: opts.exercicio ?? null, itens };
  }

  /** Linhas planas de empenhos para export (dados abertos). Cap de segurança. */
  async empenhosExport(exercicio?: number, limite = 50_000) {
    return this.empenhosQuery(exercicio ?? null, null, null, Math.min(limite, 50_000), 0);
  }

  private async empenhosQuery(
    exercicio: number | null, qParam: string | null, qLike: string | null, limit: number, offset: number,
  ) {
    const rows = await this.prisma.db.$queryRaw<EmpenhoLinha[]>`
      SELECT e.exercicio, e.org_codigo, e.emp_numero, e.emp_data, e.emp_valor,
             e.credor_ident, c.tipo_pessoa, c.nome AS credor_nome, e.descricao,
             (SELECT coalesce(sum(l.liq_valor),0) FROM aplic_liquidacao l
                WHERE l.org_codigo=e.org_codigo AND l.unor_codigo=e.unor_codigo AND l.emp_numero=e.emp_numero) AS liquidado,
             (SELECT coalesce(sum(pgto_valor),0) FROM (
                SELECT DISTINCT pg.id, pg.pgto_valor FROM aplic_pagamento pg
                JOIN aplic_pagamento_liquidacao b ON b.pgto_numero=pg.pgto_numero
                WHERE b.org_codigo=e.org_codigo AND b.unor_codigo=e.unor_codigo AND b.emp_numero=e.emp_numero) x) AS pago
      FROM aplic_empenho e
      LEFT JOIN aplic_credor c ON c.identificacao = e.credor_ident
      WHERE (${exercicio}::int IS NULL OR e.exercicio = ${exercicio})
        AND (${qParam}::text IS NULL OR e.descricao ILIKE ${qLike} OR e.emp_numero ILIKE ${qLike} OR coalesce(c.nome,'') ILIKE ${qLike})
      ORDER BY e.emp_data DESC NULLS LAST, e.emp_numero DESC
      LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((r) => ({
      exercicio: r.exercicio,
      orgao: r.org_codigo,
      empenho: r.emp_numero,
      data: r.emp_data ? r.emp_data.toISOString().slice(0, 10) : null,
      credor: mascararIdent(r.credor_ident, r.tipo_pessoa),
      credorNome: r.credor_nome ?? null,
      descricao: r.descricao ?? null,
      empenhado: num(r.emp_valor),
      liquidado: num(r.liquidado),
      pago: num(r.pago),
    }));
  }

  // ---------------------------------------------------------------- helpers

  private async buscarPorDigitos(digitos: string) {
    return this.prisma.db.$queryRaw<{ identificacao: string; nome: string | null; tipo_pessoa: string | null }[]>`
      SELECT identificacao, nome, tipo_pessoa FROM aplic_credor
      WHERE regexp_replace(identificacao,'[^0-9]','','g') LIKE ${'%' + digitos + '%'}
      ORDER BY nome LIMIT 5`;
  }

  private async agregadosDoCredor(ident: string, exercicio: number | null) {
    const emp = await this.prisma.db.$queryRaw<{ qtd: bigint; total: string }[]>`
      SELECT count(*) AS qtd, coalesce(sum(emp_valor),0) AS total FROM aplic_empenho
      WHERE credor_ident=${ident} AND (${exercicio}::int IS NULL OR exercicio=${exercicio})`;
    const liq = await this.prisma.db.$queryRaw<{ total: string }[]>`
      SELECT coalesce(sum(l.liq_valor),0) AS total
      FROM aplic_liquidacao l
      JOIN aplic_empenho e ON e.org_codigo=l.org_codigo AND e.unor_codigo=l.unor_codigo AND e.emp_numero=l.emp_numero
      WHERE e.credor_ident=${ident} AND (${exercicio}::int IS NULL OR l.exercicio=${exercicio})`;
    const pago = await this.prisma.db.$queryRaw<{ total: string }[]>`
      SELECT coalesce(sum(pgto_valor),0) AS total FROM (
        SELECT DISTINCT pg.id, pg.pgto_valor
        FROM aplic_pagamento pg
        JOIN aplic_pagamento_liquidacao b ON b.pgto_numero = pg.pgto_numero
        JOIN aplic_empenho e ON e.org_codigo=b.org_codigo AND e.unor_codigo=b.unor_codigo AND e.emp_numero=b.emp_numero
        WHERE e.credor_ident=${ident} AND (${exercicio}::int IS NULL OR pg.exercicio=${exercicio})
      ) x`;
    return {
      empenhos: Number(emp[0]?.qtd ?? 0),
      empenhado: num(emp[0]?.total),
      liquidado: num(liq[0]?.total),
      pago: num(pago[0]?.total),
    };
  }
}

interface CredorAgg { ident: string; nome: string | null; tipo: string | null; qtd: number | bigint; total: string }
interface EmpenhoLinha {
  exercicio: number; org_codigo: string | null; emp_numero: string; emp_data: Date | null; emp_valor: string;
  credor_ident: string | null; tipo_pessoa: string | null; credor_nome: string | null; descricao: string | null;
  liquidado: string; pago: string;
}

/** Converte numeric/string do Postgres em number. */
function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? round2(n) : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Mascara a identificação do credor conforme LGPD:
 * - pessoa física (CPF): mascara → "***.456.789-**"
 * - pessoa jurídica (CNPJ): público, formatado por extenso
 * - outros: retorna como veio
 */
export function mascararIdent(ident?: string | null, tipoPessoa?: string | null): string {
  if (!ident) return '';
  const d = ident.replace(/\D/g, '');
  const fisica = tipoPessoa === '1' || d.length === 11;
  if (fisica) {
    if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
    return d.length > 4 ? `***${d.slice(-2)}` : '***';
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return ident;
}
