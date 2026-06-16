import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Relatório público de transparência ativa do e-SIC / LAI.
 *
 * LGPD: NUNCA expõe campos de identificação do solicitante (nome, CPF, e-mail,
 * conteúdo da descrição). Somente campos não-pessoais são devolvidos.
 *
 * Base legal: art. 7º LAI (Lei 12.527/2011) — disponibilização ativa de
 * informações de interesse coletivo, independente de requerimento.
 *
 * RLS: todas as queries usam this.prisma.db.* com o TenantContext já definido
 * pelo TenantMiddleware. O Prisma seta app.current_tenant_id antes de cada query,
 * garantindo isolamento de tenant por Row Level Security no PostgreSQL.
 */
@Injectable()
export class EsicService {
  // Status considerados "respondidos" para fins de prazo
  private static readonly RESPONDIDOS = [
    'respondida',
    'parcialmente_atendida',
    'concluida',
    'indeferida',
  ] as const;

  // Status em aberto (pendentes)
  private static readonly ABERTOS = [
    'registrada',
    'em_analise',
    'em_tratamento',
    'aguardando_cidadao',
    'prorrogada',
    'recurso_1a_instancia',
    'recurso_2a_instancia',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega estatísticas públicas dos pedidos e-SIC do tenant.
   * Dados completamente anônimos — sem PII.
   */
  async estatisticas() {
    const db = this.prisma.db;

    // Filtra somente manifestações do canal e-SIC.
    // Cast necessário porque Prisma tipifica canal como enum ManifestacaoCanal.
    const whereEsic = { canal: 'esic' as any };

    const [
      total,
      porStatus,
      serieMensal,
      tempoMedio,
      prazoStats,
      ultimasSolicitacoes,
    ] = await Promise.all([
      // 1. Total de pedidos e-SIC
      db.manifestacao.count({ where: whereEsic }),

      // 2. Contagem por status
      db.manifestacao.groupBy({
        by: ['status'],
        where: whereEsic,
        _count: { _all: true },
      }),

      // 3. Série dos últimos 12 meses (abertura)
      db.$queryRaw<{ mes: string; total: bigint }[]>`
        SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
               count(*) AS total
        FROM manifestacoes
        WHERE canal = 'esic'
          AND criado_em >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
        ORDER BY 1`,

      // 4. Tempo médio de resposta (dias) — somente pedidos respondidos
      db.$queryRaw<{ dias: number | null }[]>`
        SELECT round(
          avg(extract(epoch FROM (respondido_em - criado_em)) / 86400)::numeric,
          1
        )::float AS dias
        FROM manifestacoes
        WHERE canal = 'esic'
          AND respondido_em IS NOT NULL`,

      // 5. % respondidos no prazo legal (respondido_em <= prazo_em)
      db.$queryRaw<{ no_prazo: bigint; respondidas: bigint }[]>`
        SELECT
          count(*) FILTER (WHERE respondido_em <= prazo_em) AS no_prazo,
          count(*)                                          AS respondidas
        FROM manifestacoes
        WHERE canal = 'esic'
          AND respondido_em IS NOT NULL`,

      // 6. Últimas 50 solicitações (somente campos não-pessoais)
      db.manifestacao.findMany({
        where: whereEsic,
        orderBy: { criadoEm: 'desc' },
        take: 50,
        select: {
          protocolo: true,
          assunto: true,
          tipo: true,
          status: true,
          criadoEm: true,
          respondidoEm: true,
          prorrogado: true,
          // LGPD: NÃO selecionar: solicitanteNome, solicitanteEmail, cidadaoId,
          //                        chaveHash, descricao (pode ter PII), cpfHash
        },
      }),
    ]);

    const respondidas = Number(prazoStats[0]?.respondidas ?? 0);
    const noPrazo = Number(prazoStats[0]?.no_prazo ?? 0);

    const abertos = porStatus
      .filter((s) =>
        (EsicService.ABERTOS as readonly string[]).includes(s.status),
      )
      .reduce((sum, s) => sum + s._count._all, 0);

    return {
      geradoEm: new Date().toISOString(),
      total,
      abertos,
      respondidas,
      taxaResposta: total > 0 ? Math.round((respondidas / total) * 100) : 0,
      taxaNoPrazo: respondidas > 0 ? Math.round((noPrazo / respondidas) * 100) : null,
      tempoMedioDias:
        tempoMedio[0]?.dias != null
          ? Number(tempoMedio[0].dias)
          : null,
      porStatus: porStatus.map((s) => ({ status: s.status, total: s._count._all })),
      serieMensal: serieMensal.map((r) => ({
        mes: r.mes,
        total: Number(r.total),
      })),
      // Somente campos não-pessoais — LGPD art. 5º / princípio da minimização
      ultimasSolicitacoes: ultimasSolicitacoes.map((m) => ({
        protocolo: m.protocolo,
        assunto: m.assunto,
        tipo: m.tipo,
        status: m.status,
        abertoEm: m.criadoEm,
        respondidoEm: m.respondidoEm ?? null,
        prorrogado: m.prorrogado,
      })),
    };
  }
}
