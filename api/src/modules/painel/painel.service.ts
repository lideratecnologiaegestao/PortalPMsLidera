import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** status de manifestação considerados ENCERRADOS (resto = em andamento). */
const ENCERRADAS = ['respondida', 'indeferida', 'parcialmente_atendida', 'concluida', 'arquivada'];
const ABERTOS_CHAMADO_EXCLUI = ['resolvido', 'cancelado', 'duplicado'];
/** denúncia urbana aberta há mais que isso = "parada" (gargalo a destacar). */
const DIAS_PARADO = 15;

const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Camada de BI dos painéis de parede (TV). Tudo agregado (sem linha sensível),
 * RLS limita ao tenant. Dois recortes: operacional (ouvidor) e executivo (prefeito).
 */
@Injectable()
export class PainelService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────── Ouvidor (operacional) ─────────────────
  async ouvidoria() {
    const db = this.prisma.db;

    const [kpi] = await db.$queryRaw<any[]>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}))::int AS abertas,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}) AND prazo_em < now())::int AS vencidas,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}) AND prazo_em >= now() AND prazo_em < now() + interval '48 hours')::int AS vencendo48h,
        count(*) FILTER (WHERE respondido_em IS NOT NULL)::int AS respondidas,
        count(*) FILTER (WHERE respondido_em IS NOT NULL AND respondido_em <= prazo_em)::int AS respondidas_no_prazo,
        avg(EXTRACT(EPOCH FROM (respondido_em - criado_em)) / 86400.0) FILTER (WHERE respondido_em IS NOT NULL) AS tempo_medio_dias
      FROM manifestacoes`;

    const porStatus = await db.$queryRaw<any[]>`
      SELECT status::text AS k, count(*)::int AS n FROM manifestacoes GROUP BY status ORDER BY n DESC`;
    const porCanal = await db.$queryRaw<any[]>`
      SELECT canal::text AS k, count(*)::int AS n FROM manifestacoes GROUP BY canal ORDER BY n DESC`;
    const porTipo = await db.$queryRaw<any[]>`
      SELECT tipo::text AS k, count(*)::int AS n FROM manifestacoes GROUP BY tipo ORDER BY n DESC`;

    const filaPrazo = await db.$queryRaw<any[]>`
      SELECT protocolo, tipo::text AS tipo, canal::text AS canal, status::text AS status, prazo_em,
             round(EXTRACT(EPOCH FROM (prazo_em - now())) / 86400.0)::int AS dias_restantes
      FROM manifestacoes
      WHERE status::text <> ALL(${ENCERRADAS})
      ORDER BY prazo_em ASC NULLS LAST
      LIMIT 8`;

    const [ch] = await db.$queryRaw<any[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status::text <> ALL(${ABERTOS_CHAMADO_EXCLUI}))::int AS abertos,
             count(*) FILTER (WHERE status::text = 'resolvido')::int AS resolvidos,
             avg(EXTRACT(EPOCH FROM (resolvido_em - criado_em)) / 86400.0) FILTER (WHERE resolvido_em IS NOT NULL) AS tempo_medio_dias
      FROM chamados`;
    const chPorStatus = await db.$queryRaw<any[]>`
      SELECT status::text AS k, count(*)::int AS n FROM chamados GROUP BY status ORDER BY n DESC`;
    const chPorCategoria = await db.$queryRaw<any[]>`
      SELECT categoria::text AS k, count(*)::int AS n FROM chamados GROUP BY categoria ORDER BY n DESC`;

    const sat = await this.satisfacao();

    const respondidas = num(kpi.respondidas);
    return {
      manifestacoes: {
        total: num(kpi.total),
        abertas: num(kpi.abertas),
        vencidas: num(kpi.vencidas),
        vencendo48h: num(kpi.vencendo48h),
        noPrazoPct: respondidas ? Math.round((num(kpi.respondidas_no_prazo) / respondidas) * 100) : null,
        tempoMedioDias: kpi.tempo_medio_dias != null ? Math.round(num(kpi.tempo_medio_dias) * 10) / 10 : null,
        porStatus: porStatus.map((r) => ({ k: r.k, n: num(r.n) })),
        porCanal: porCanal.map((r) => ({ k: r.k, n: num(r.n) })),
        porTipo: porTipo.map((r) => ({ k: r.k, n: num(r.n) })),
        filaPrazo: filaPrazo.map((r) => ({
          protocolo: r.protocolo, tipo: r.tipo, canal: r.canal, status: r.status,
          prazoEm: r.prazo_em, diasRestantes: num(r.dias_restantes),
        })),
      },
      chamados: {
        total: num(ch.total),
        abertos: num(ch.abertos),
        resolvidos: num(ch.resolvidos),
        tempoMedioDias: ch.tempo_medio_dias != null ? Math.round(num(ch.tempo_medio_dias) * 10) / 10 : null,
        porStatus: chPorStatus.map((r) => ({ k: r.k, n: num(r.n) })),
        porCategoria: chPorCategoria.map((r) => ({ k: r.k, n: num(r.n) })),
      },
      satisfacao: sat,
      atualizadoEm: new Date().toISOString(),
    };
  }

  // ───────────────────────────────── Prefeito (executivo) ──────────────────
  async prefeito() {
    const db = this.prisma.db;

    const [m] = await db.$queryRaw<any[]>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE criado_em >= date_trunc('month', now()))::int AS no_mes,
        count(*) FILTER (WHERE status::text = ANY(${ENCERRADAS}))::int AS encerradas,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}))::int AS abertas,
        count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}) AND prazo_em < now())::int AS vencidas,
        count(*) FILTER (WHERE respondido_em IS NOT NULL)::int AS respondidas,
        count(*) FILTER (WHERE respondido_em IS NOT NULL AND respondido_em <= prazo_em)::int AS no_prazo,
        avg(EXTRACT(EPOCH FROM (respondido_em - criado_em)) / 86400.0) FILTER (WHERE respondido_em IS NOT NULL) AS tempo_medio_dias
      FROM manifestacoes`;

    const [c] = await db.$queryRaw<any[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE criado_em >= date_trunc('month', now()))::int AS no_mes,
             count(*) FILTER (WHERE status::text = 'resolvido')::int AS resolvidos,
             count(*) FILTER (WHERE status::text <> ALL(${ABERTOS_CHAMADO_EXCLUI}))::int AS abertos,
             count(*) FILTER (WHERE status::text <> ALL(${ABERTOS_CHAMADO_EXCLUI}) AND criado_em < now() - (${DIAS_PARADO} || ' days')::interval)::int AS parados
      FROM chamados`;

    const porSecretaria = await db.$queryRaw<any[]>`
      SELECT COALESCE(s.nome, 'Não atribuída') AS k, count(*)::int AS n
      FROM manifestacoes mf LEFT JOIN secretarias s ON s.id = mf.secretaria_id
      GROUP BY COALESCE(s.nome, 'Não atribuída') ORDER BY n DESC LIMIT 6`;

    const denunciasPorCategoria = await db.$queryRaw<any[]>`
      SELECT categoria::text AS k, count(*)::int AS n FROM chamados GROUP BY categoria ORDER BY n DESC LIMIT 6`;

    // tendência dos últimos 6 meses (entradas x resolvidas), manifestações + chamados
    const entradas = await db.$queryRaw<any[]>`
      SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS mes, count(*)::int AS n FROM (
        SELECT criado_em AS d FROM manifestacoes WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
        UNION ALL
        SELECT criado_em FROM chamados WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
      ) x GROUP BY 1 ORDER BY 1`;
    const resolvidas = await db.$queryRaw<any[]>`
      SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS mes, count(*)::int AS n FROM (
        SELECT respondido_em AS d FROM manifestacoes WHERE respondido_em >= date_trunc('month', now()) - interval '5 months'
        UNION ALL
        SELECT resolvido_em FROM chamados WHERE resolvido_em >= date_trunc('month', now()) - interval '5 months'
      ) x GROUP BY 1 ORDER BY 1`;

    const sat = await this.satisfacao();

    const respondidas = num(m.respondidas);
    const totalDemandas = num(m.total) + num(c.total);
    const encerradas = num(m.encerradas) + num(c.resolvidos);

    return {
      resumo: {
        demandasMes: num(m.no_mes) + num(c.no_mes),
        demandasTotal: totalDemandas,
        resolvidasPct: totalDemandas ? Math.round((encerradas / totalDemandas) * 100) : null,
        satisfacao: sat.media,
        satisfacaoTotal: sat.total,
        tempoMedioDias: m.tempo_medio_dias != null ? Math.round(num(m.tempo_medio_dias) * 10) / 10 : null,
        slaCumprimentoPct: respondidas ? Math.round((num(m.no_prazo) / respondidas) * 100) : null,
      },
      demandas: {
        manifestacoesAbertas: num(m.abertas),
        chamadosAbertos: num(c.abertos),
        chamadosParados: num(c.parados),
        diasParado: DIAS_PARADO,
        vencidas: num(m.vencidas),
      },
      porSecretaria: porSecretaria.map((r) => ({ k: r.k, n: num(r.n) })),
      denunciasPorCategoria: denunciasPorCategoria.map((r) => ({ k: r.k, n: num(r.n) })),
      tendencia: this.mesclarTendencia(entradas, resolvidas),
      satisfacaoDist: sat.distribuicao,
      comentarios: sat.comentarios,
      atualizadoEm: new Date().toISOString(),
    };
  }

  // ───────────────────────────────── compartilhado ─────────────────────────
  private async satisfacao() {
    const db = this.prisma.db;
    const [s] = await db.$queryRaw<any[]>`
      SELECT count(*)::int AS total, avg(nota)::numeric(10,2) AS media FROM pesquisa_satisfacao`;
    const dist = await db.$queryRaw<any[]>`
      SELECT nota::int AS nota, count(*)::int AS n FROM pesquisa_satisfacao GROUP BY nota ORDER BY nota`;
    const comentarios = await db.$queryRaw<any[]>`
      SELECT nota::int AS nota, comentario, criado_em FROM pesquisa_satisfacao
      WHERE comentario IS NOT NULL AND length(trim(comentario)) > 0
      ORDER BY criado_em DESC LIMIT 5`;
    const distMap = new Map(dist.map((r) => [num(r.nota), num(r.n)]));
    return {
      total: num(s.total),
      media: s.media != null ? Number(s.media) : null,
      distribuicao: [1, 2, 3, 4, 5].map((nota) => ({ nota, n: distMap.get(nota) ?? 0 })),
      comentarios: comentarios.map((r) => ({ nota: num(r.nota), comentario: r.comentario, criadoEm: r.criado_em })),
    };
  }

  private mesclarTendencia(entradas: any[], resolvidas: any[]) {
    const meses: string[] = [];
    const base = new Date();
    base.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const eMap = new Map(entradas.map((r) => [r.mes, num(r.n)]));
    const rMap = new Map(resolvidas.map((r) => [r.mes, num(r.n)]));
    return meses.map((mes) => ({ mes, entradas: eMap.get(mes) ?? 0, resolvidas: rMap.get(mes) ?? 0 }));
  }
}
