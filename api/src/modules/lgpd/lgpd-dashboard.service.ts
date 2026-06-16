/**
 * Service do Dashboard Consolidado de Conformidade LGPD.
 *
 * Agrega metadados do tenant atual (via RLS automático) para um snapshot
 * read-only de conformidade. Nenhum conteúdo de solicitação ou incidente
 * é exposto — apenas contagens, datas e derivações.
 *
 * SCORE (0-100) — heurística transparente:
 *   Base: 100 pontos
 *   -30  se DPO não configurado (dpoNome OU dpoEmail ausentes no tenant)
 *   -30  proporcional à taxa de solicitações atrasadas entre as abertas
 *        ex.: 2 atrasadas de 5 abertas → -(2/5 * 30) = -12
 *   -40  proporcional à taxa de incidentes com comunicação atrasada entre os abertos
 *        ex.: 1 atrasado de 2 abertos → -(1/2 * 40) = -20
 *   Piso: 0 (nunca negativo)
 *
 * ATRASADAS (solicitacoes):
 *   status IN (aberta, em_andamento, encaminhada) AND prazoEm < now()
 *   (mesmo critério derivado em solicitacoes.service.ts)
 *
 * VENCENDO EM 48h:
 *   status IN (aberta, em_andamento, encaminhada) AND prazoEm BETWEEN now() AND now()+48h
 *
 * COMUNICAÇÃO ATRASADA (incidentes):
 *   status IN (registrado, em_avaliacao, em_contencao) AND prazoComunicacaoEm < now()
 *   (mesmo critério derivado em incidentes.service.ts)
 *
 * TEMPO MÉDIO DE RESPOSTA:
 *   Média de (tratadoEm - criadoEm) em dias inteiros para solicitações com
 *   status = concluida OR indeferida E tratadoEm IS NOT NULL.
 *   Retorna null se não houver nenhuma concluída/indeferida com tratadoEm.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

const STATUS_ABERTOS_SOL = ['aberta', 'em_andamento', 'encaminhada'];
const STATUS_ABERTOS_INC = ['registrado', 'em_avaliacao', 'em_contencao'];

export interface ConformidadeSnapshot {
  geradoEm: string;
  encarregado: {
    configurado: boolean;
    nome: string | null;
    email: string | null;
  };
  solicitacoes: {
    total: number;
    abertas: number;
    concluidas: number;
    indeferidas: number;
    atrasadas: number;
    vencendoEm48h: number;
    porTipo: Array<{ tipo: string; total: number }>;
    tempoMedioRespostaDias: number | null;
  };
  incidentes: {
    total: number;
    abertos: number;
    comunicacaoAtrasada: number;
    porSeveridade: Array<{ severidade: string; total: number }>;
    comunicadosAnpd: number;
  };
  retencao: {
    solicitacoesGuardaAnos: number;
    incidentesGuardaAnos: number;
  };
  score: number;
  alertas: string[];
}

@Injectable()
export class LgpdDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async conformidade(): Promise<ConformidadeSnapshot> {
    const tenantId = TenantContext.tenantId();
    const agora = new Date();
    const agora48h = new Date(agora.getTime() + 48 * 60 * 60 * 1000);

    // ─── 1. DPO do tenant (tabela de plataforma, sem RLS por tenant_id) ──────
    // Justificativa para prisma.platform(): tenants é tabela de plataforma;
    // usamos apenas os campos dpoNome/dpoEmail do próprio tenant do contexto.
    const tenant = tenantId
      ? await this.prisma.platform().tenant.findUnique({
          where: { id: tenantId },
          select: { dpoNome: true, dpoEmail: true },
        })
      : null;

    const dpoCadastrado = Boolean(tenant?.dpoNome && tenant?.dpoEmail);

    // ─── 2. Solicitações (via this.prisma.db — RLS automático) ───────────────

    // 2a. Contagens por status (groupBy)
    const solGroupBy = await this.prisma.db.solicitacaoTitular.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const solTotal = solGroupBy.reduce((acc, r) => acc + r._count.id, 0);
    const solAbertas = solGroupBy
      .filter((r) => STATUS_ABERTOS_SOL.includes(r.status))
      .reduce((acc, r) => acc + r._count.id, 0);
    const solConcluidas =
      solGroupBy.find((r) => r.status === 'concluida')?._count.id ?? 0;
    const solIndeferidas =
      solGroupBy.find((r) => r.status === 'indeferida')?._count.id ?? 0;

    // 2b. Atrasadas: abertas com prazoEm < agora
    const solAtrasadas = await this.prisma.db.solicitacaoTitular.count({
      where: {
        status: { in: STATUS_ABERTOS_SOL },
        prazoEm: { lt: agora },
      },
    });

    // 2c. Vencendo em 48h: abertas com prazoEm entre agora e agora+48h
    const solVencendo48h = await this.prisma.db.solicitacaoTitular.count({
      where: {
        status: { in: STATUS_ABERTOS_SOL },
        prazoEm: { gte: agora, lte: agora48h },
      },
    });

    // 2d. Agrupamento por tipo
    const solPorTipo = await this.prisma.db.solicitacaoTitular.groupBy({
      by: ['tipo'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // 2e. Tempo médio de resposta (dias) para concluídas/indeferidas com tratadoEm
    // Calculado em memória (n tipicamente pequeno) via findMany com select mínimo.
    // RLS continua válido pois this.prisma.db seta o GUC de tenant automaticamente.
    const concluidas = await this.prisma.db.solicitacaoTitular.findMany({
      where: {
        status: { in: ['concluida', 'indeferida'] },
        tratadoEm: { not: null },
      },
      select: { criadoEm: true, tratadoEm: true },
    });

    let tempoMedioRespostaDias: number | null = null;
    if (concluidas.length > 0) {
      const somaMs = concluidas.reduce((acc, s) => {
        const diff = (s.tratadoEm as Date).getTime() - s.criadoEm.getTime();
        return acc + diff;
      }, 0);
      // Converte milissegundos para dias, arredonda para 1 casa decimal
      const mediaMs = somaMs / concluidas.length;
      tempoMedioRespostaDias =
        Math.round((mediaMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // ─── 3. Incidentes (via this.prisma.db — RLS automático) ─────────────────

    // 3a. Contagens por status
    const incGroupBy = await this.prisma.db.incidenteSeguranca.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const incTotal = incGroupBy.reduce((acc, r) => acc + r._count.id, 0);
    const incAbertos = incGroupBy
      .filter((r) => STATUS_ABERTOS_INC.includes(r.status))
      .reduce((acc, r) => acc + r._count.id, 0);

    // 3b. Comunicação atrasada: abertos com prazoComunicacaoEm < agora
    const incComunicacaoAtrasada =
      await this.prisma.db.incidenteSeguranca.count({
        where: {
          status: { in: STATUS_ABERTOS_INC },
          prazoComunicacaoEm: { lt: agora },
        },
      });

    // 3c. Agrupamento por severidade
    const incPorSeveridade = await this.prisma.db.incidenteSeguranca.groupBy({
      by: ['severidade'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // 3d. Comunicados à ANPD
    const incComunicadosAnpd = await this.prisma.db.incidenteSeguranca.count({
      where: { comunicadoAnpd: true },
    });

    // ─── 4. Score de conformidade (0-100) ────────────────────────────────────
    //
    // Fórmula:
    //   score = 100
    //     - (dpoCadastrado ? 0 : 30)
    //     - (solAtrasadas / max(solAbertas, 1)) * 30
    //     - (incComunicacaoAtrasada / max(incAbertos, 1)) * 40
    //   Piso: 0
    //
    // Nota: a proporção usa max(abertas,1) para evitar divisão por zero quando
    // não há abertas — nesse caso contribuição é 0 (sem atrasadas).
    let score = 100;
    if (!dpoCadastrado) score -= 30;

    if (solAtrasadas > 0) {
      score -= (solAtrasadas / Math.max(solAbertas, 1)) * 30;
    }
    if (incComunicacaoAtrasada > 0) {
      score -= (incComunicacaoAtrasada / Math.max(incAbertos, 1)) * 40;
    }
    score = Math.max(0, Math.round(score));

    // ─── 5. Alertas ──────────────────────────────────────────────────────────
    const alertas: string[] = [];
    if (!dpoCadastrado) {
      alertas.push('Encarregado (DPO) não configurado');
    }
    if (solAtrasadas > 0) {
      alertas.push(
        `${solAtrasadas} solicitaç${solAtrasadas === 1 ? 'ão' : 'ões'} fora do prazo`,
      );
    }
    if (solVencendo48h > 0) {
      alertas.push(
        `${solVencendo48h} solicitaç${solVencendo48h === 1 ? 'ão vence' : 'ões vencem'} nas próximas 48h`,
      );
    }
    if (incComunicacaoAtrasada > 0) {
      alertas.push(
        `${incComunicacaoAtrasada} incidente${incComunicacaoAtrasada === 1 ? '' : 's'} com comunicação atrasada`,
      );
    }

    // ─── 6. Montar snapshot ──────────────────────────────────────────────────
    return {
      geradoEm: agora.toISOString(),
      encarregado: {
        configurado: dpoCadastrado,
        nome: tenant?.dpoNome ?? null,
        email: tenant?.dpoEmail ?? null,
      },
      solicitacoes: {
        total: solTotal,
        abertas: solAbertas,
        concluidas: solConcluidas,
        indeferidas: solIndeferidas,
        atrasadas: solAtrasadas,
        vencendoEm48h: solVencendo48h,
        porTipo: solPorTipo.map((r) => ({ tipo: r.tipo, total: r._count.id })),
        tempoMedioRespostaDias,
      },
      incidentes: {
        total: incTotal,
        abertos: incAbertos,
        comunicacaoAtrasada: incComunicacaoAtrasada,
        porSeveridade: incPorSeveridade.map((r) => ({
          severidade: r.severidade,
          total: r._count.id,
        })),
        comunicadosAnpd: incComunicadosAnpd,
      },
      retencao: {
        // Valores informados pela política de retenção (docs/06-lgpd-gdpr.md).
        // Não são contagens — são os prazos legais de guarda em anos.
        solicitacoesGuardaAnos: 5,
        incidentesGuardaAnos: 5,
      },
      score,
      alertas,
    };
  }
}
