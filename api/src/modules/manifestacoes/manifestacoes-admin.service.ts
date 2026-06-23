import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

/** Status encerrados (copiam a constante do PainelService para evitar dep circular). */
const ENCERRADAS_DASH = ['respondida', 'indeferida', 'parcialmente_atendida', 'concluida', 'arquivada'];

const numDash = (v: unknown) => (v == null ? 0 : Number(v));

export interface FiltroManifestacao {
  canal?: string;
  status?: string;
  tipo?: string;
  q?: string;
  responsavelId?: string;
  secretariaId?: string;
  escopoSecretariaId?: string;
  dataDe?: string;
  dataAte?: string;
}

const ABERTOS = [
  'registrada', 'em_analise', 'em_tratamento', 'aguardando_cidadao',
  'prorrogada', 'recurso_1a_instancia', 'recurso_2a_instancia',
];

@Injectable()
export class ManifestacoesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Monta o filtro comum (lista, export e relatório). */
  private montarWhere(opts: FiltroManifestacao): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (opts.canal) where.canal = opts.canal;
    if (opts.status) where.status = opts.status;
    if (opts.tipo) where.tipo = opts.tipo;
    if (opts.responsavelId) where.responsavelId = opts.responsavelId;
    // Separação por departamento: o escopo forçado (servidor da área) tem
    // precedência sobre o filtro escolhido na tela.
    const sec = opts.escopoSecretariaId ?? opts.secretariaId;
    if (sec) where.secretariaId = sec;
    if (opts.dataDe || opts.dataAte) {
      const c: Record<string, Date> = {};
      if (opts.dataDe) c.gte = new Date(opts.dataDe);
      if (opts.dataAte) c.lte = new Date(`${opts.dataAte}T23:59:59`);
      where.criadoEm = c;
    }
    if (opts.q) {
      where.OR = [
        { assunto: { contains: opts.q, mode: 'insensitive' } },
        { protocolo: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /**
   * Escopo de departamento do usuário: servidores de área veem só a sua
   * secretaria; ouvidor/gestor/admin veem tudo (retorna undefined).
   */
  async escopoSecretaria(userId?: string, role?: string): Promise<string | undefined> {
    if (!userId || role !== 'servidor') return undefined;
    const u = await this.prisma.db.user.findUnique({ where: { id: userId }, select: { secretariaId: true } });
    return u?.secretariaId ?? undefined;
  }

  async listar(opts: FiltroManifestacao & { page: number; pageSize: number }) {
    const where = this.montarWhere(opts);

    const [raw, total] = await Promise.all([
      this.prisma.db.manifestacao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          protocolo: true,
          canal: true,
          tipo: true,
          status: true,
          assunto: true,
          prazoEm: true,
          prorrogado: true,
          anonima: true,
          solicitanteNome: true,
          responsavelId: true,
          secretariaId: true,
          criadoEm: true,
        },
      }),
      this.prisma.db.manifestacao.count({ where }),
    ]);

    // LGPD: mascara identidade de manifestações anônimas
    const items = raw.map((m) => ({
      ...m,
      solicitanteNome: m.anonima ? null : m.solicitanteNome,
    }));

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async detalhe(id: string) {
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id },
      include: {
        eventos: {
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            evento: true,
            deStatus: true,
            paraStatus: true,
            observacao: true,
            atorId: true,
            criadoEm: true,
          },
        },
      },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    // LGPD: mascara identidade se anônima; NUNCA expõe CPF (não está no select)
    // ManifestacaoEvento.id é BigInt — converte para string para JSON
    const eventos = (m.eventos ?? []).map((e) => ({ ...e, id: String(e.id) }));
    return {
      ...m,
      eventos,
      solicitanteNome: m.anonima ? null : m.solicitanteNome,
      // cidadaoId mantido para uso interno (referência ao User), não expõe dados pessoais
    };
  }

  /** Atribuição administrativa (responsável / secretaria). NÃO altera status. */
  async atribuir(
    id: string,
    dados: { responsavelId?: string; secretariaId?: string },
    atorId?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const data: Record<string, unknown> = {};
    if (dados.responsavelId !== undefined) data.responsavelId = dados.responsavelId;
    if (dados.secretariaId !== undefined) data.secretariaId = dados.secretariaId;

    const atualizada = await this.prisma.db.manifestacao.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        protocolo: true,
        responsavelId: true,
        secretariaId: true,
        status: true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'MANIFESTACAO_ATRIBUIDA',
        entidade: 'manifestacoes',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizada;
  }

  // ----------------------------------------------- export (linha a linha)
  /** Linhas para export CSV/JSON (sem paginação; mascara anônimos). */
  async listarParaExport(opts: FiltroManifestacao) {
    const where = this.montarWhere(opts);
    const rows = await this.prisma.db.manifestacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 5000,
      select: {
        protocolo: true, canal: true, tipo: true, status: true, assunto: true,
        anonima: true, solicitanteNome: true, secretariaId: true, prazoEm: true,
        prorrogado: true, respondidoEm: true, criadoEm: true,
      },
    });
    const nomes = await this.mapaSecretarias();
    return rows.map((m) => ({
      protocolo: m.protocolo,
      canal: m.canal,
      tipo: m.tipo,
      status: m.status,
      assunto: m.assunto,
      solicitante: m.anonima ? '(anônima)' : (m.solicitanteNome ?? ''),
      secretaria: m.secretariaId ? (nomes.get(m.secretariaId) ?? '') : '',
      prazo: m.prazoEm,
      prorrogado: m.prorrogado ? 'sim' : 'não',
      respondidoEm: m.respondidoEm ?? '',
      criadoEm: m.criadoEm,
    }));
  }

  // ----------------------------------------------- relatório agregado
  /** Dados agregados para o relatório/gráficos da Ouvidoria (por período). */
  async relatorioDados(opts: FiltroManifestacao) {
    const where = this.montarWhere(opts);
    const db = this.prisma.db;

    const [total, abertos, respondidas, porTipoRaw, porStatusRaw, porCanalRaw, porSecRaw, sats] =
      await Promise.all([
        db.manifestacao.count({ where }),
        db.manifestacao.count({ where: { ...where, status: { in: ABERTOS } } as any }),
        db.manifestacao.count({ where: { ...where, status: { in: ['respondida', 'parcialmente_atendida', 'concluida'] } } as any }),
        db.manifestacao.groupBy({ by: ['tipo'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['status'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['canal'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['secretariaId'], where, _count: { _all: true } }),
        db.pesquisaSatisfacao.findMany({
          where: { manifestacao: where as any },
          select: { nota: true },
        }),
      ]);

    const nomes = await this.mapaSecretarias();
    const distrib = [1, 2, 3, 4, 5].map((n) => ({ nota: n, total: sats.filter((s) => s.nota === n).length }));
    const somaSat = sats.reduce((a, s) => a + s.nota, 0);

    return {
      geradoEm: new Date().toISOString(),
      periodo: { de: opts.dataDe ?? null, ate: opts.dataAte ?? null },
      resumo: {
        total,
        abertos,
        respondidas,
        taxaResposta: total ? Math.round((respondidas / total) * 100) : 0,
      },
      porTipo: porTipoRaw.map((r) => ({ chave: r.tipo, total: r._count._all })).sort((a, b) => b.total - a.total),
      porStatus: porStatusRaw.map((r) => ({ chave: r.status, total: r._count._all })).sort((a, b) => b.total - a.total),
      porCanal: porCanalRaw.map((r) => ({ chave: r.canal, total: r._count._all })),
      porSecretaria: porSecRaw
        .map((r) => ({ chave: r.secretariaId ? (nomes.get(r.secretariaId) ?? 'Sem secretaria') : 'Sem secretaria', total: r._count._all }))
        .sort((a, b) => b.total - a.total),
      satisfacao: {
        total: sats.length,
        media: sats.length ? Number((somaSat / sats.length).toFixed(2)) : 0,
        distribuicao: distrib,
      },
    };
  }

  // ----------------------------------------------- dashboard do ouvidor
  /**
   * Dashboard consolidado — KPIs de SLA + distribuições agregadas.
   * ADR-0005 Fase 3. Sem dado pessoal; apenas contadores e médias.
   */
  async dashboard() {
    const db = this.prisma.db;

    // ---- KPIs de SLA (raw SQL para aproveitar filtros de timestamp no BD)
    const [kpi] = await db.$queryRaw<any[]>`
      SELECT
        count(*)::int                                                                         AS total,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS_DASH}))::int                 AS abertas,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS_DASH}) AND prazo_em < now())::int AS vencidas,
        count(*) FILTER (
          WHERE status::text <> ALL(${ENCERRADAS_DASH})
            AND prazo_em >= now()
            AND prazo_em <  now() + interval '48 hours'
        )::int AS vencendo48h,
        count(*) FILTER (WHERE respondido_em IS NOT NULL)::int                               AS respondidas,
        count(*) FILTER (WHERE respondido_em IS NOT NULL AND respondido_em <= prazo_em)::int AS no_prazo,
        avg(EXTRACT(EPOCH FROM (respondido_em - criado_em)) / 86400.0)
          FILTER (WHERE respondido_em IS NOT NULL)                                           AS tempo_medio_dias
      FROM manifestacoes`;

    // ---- Satisfação
    const [sat] = await db.$queryRaw<any[]>`
      SELECT count(*)::int AS total, avg(nota)::numeric(10,2) AS media FROM pesquisa_satisfacao`;
    const satDist = await db.$queryRaw<any[]>`
      SELECT nota::int AS nota, count(*)::int AS total
      FROM pesquisa_satisfacao GROUP BY nota ORDER BY nota`;

    // ---- Distribuições
    const [porStatusRaw, porTipoRaw, porCanalRaw] = await Promise.all([
      db.manifestacao.groupBy({ by: ['status'], _count: { _all: true } }),
      db.manifestacao.groupBy({ by: ['tipo'],   _count: { _all: true } }),
      db.manifestacao.groupBy({ by: ['canal'],  _count: { _all: true } }),
    ]);

    // ---- Por Secretaria (com nome)
    const porSecRaw = await db.$queryRaw<any[]>`
      SELECT COALESCE(s.nome, 'Não atribuída') AS secretaria, count(*)::int AS total
      FROM manifestacoes mf
      LEFT JOIN secretarias s ON s.id = mf.secretaria_id
      GROUP BY COALESCE(s.nome, 'Não atribuída')
      ORDER BY total DESC`;

    // ---- Série mensal (últimos 6 meses, somente total de abertas)
    const serieMensalRaw = await db.$queryRaw<any[]>`
      SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
             count(*)::int AS total
      FROM manifestacoes
      WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
      GROUP BY 1
      ORDER BY 1`;

    // Garante todos os 6 meses mesmo sem dados
    const base = new Date();
    base.setDate(1);
    const meses6: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      meses6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const serieMap = new Map((serieMensalRaw).map((r) => [r.mes as string, numDash(r.total)]));
    const serieMensal = meses6.map((mes) => ({ mes, total: serieMap.get(mes) ?? 0 }));

    const respondidas = numDash(kpi.respondidas);
    const noPrazo     = numDash(kpi.no_prazo);

    // Distribuição de satisfação — preenche notas 1..5 mesmo com zero votos
    const satDistMap = new Map((satDist).map((r) => [Number(r.nota), numDash(r.total)]));
    const satisfacaoDistribuicao = [1, 2, 3, 4, 5].map((nota) => ({
      nota,
      total: satDistMap.get(nota) ?? 0,
    }));

    return {
      kpis: {
        total:          numDash(kpi.total),
        abertas:        numDash(kpi.abertas),
        vencidas:       numDash(kpi.vencidas),
        vencendo48h:    numDash(kpi.vencendo48h),
        noPrazoPct:     respondidas ? Math.round((noPrazo / respondidas) * 100) : null,
        tempoMedioDias: kpi.tempo_medio_dias != null
          ? Math.round(numDash(kpi.tempo_medio_dias) * 10) / 10
          : null,
        satisfacaoMedia:  sat.media != null ? Number(sat.media) : null,
        satisfacaoTotal:  numDash(sat.total),
      },
      porStatus: porStatusRaw
        .map((r) => ({ status: r.status as string, total: r._count._all }))
        .sort((a, b) => b.total - a.total),
      porTipo: porTipoRaw
        .map((r) => ({ tipo: r.tipo as string, total: r._count._all }))
        .sort((a, b) => b.total - a.total),
      porCanal: porCanalRaw
        .map((r) => ({ canal: r.canal as string, total: r._count._all })),
      porSecretaria: porSecRaw.map((r) => ({
        secretaria: r.secretaria as string,
        total: numDash(r.total),
      })),
      serieMensal,
      satisfacaoDistribuicao,
    };
  }

  private async mapaSecretarias(): Promise<Map<string, string>> {
    const secs = await this.prisma.db.secretaria.findMany({ select: { id: true, nome: true } });
    return new Map(secs.map((s) => [s.id, s.nome]));
  }

  /** Nome do município (para cabeçalho de relatórios). */
  async municipioNome(): Promise<string> {
    const t = await this.prisma
      .platform()
      .tenant.findUnique({ where: { id: TenantContext.tenantId()! }, select: { nome: true } });
    return t?.nome ?? 'Município';
  }
}

export type RelatorioDados = Awaited<ReturnType<ManifestacoesAdminService['relatorioDados']>>;
