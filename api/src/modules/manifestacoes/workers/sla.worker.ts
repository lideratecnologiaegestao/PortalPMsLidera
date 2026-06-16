import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContext } from '../../../common/tenant/tenant.context';
import {
  JOB_NOTIF_ENVIAR,
  JOB_SLA_SCAN,
  JOB_SLA_VENCIDO,
  QUEUE_NOTIFICACOES,
} from '../../queue/queue.constants';
import { slaAtRisk } from '../../../common/metrics/metrics';
import { SlaJobData } from '../manifestacao.types';

// Status que já encerraram o prazo — se a manifestação chegou aqui, o job é no-op.
const ENCERRADOS = new Set([
  'respondida',
  'indeferida',
  'parcialmente_atendida',
  'concluida',
  'arquivada',
]);

@Processor('manifestacao-sla', { concurrency: 5 })
export class SlaWorker extends WorkerHost {
  private readonly logger = new Logger(SlaWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NOTIFICACOES) private readonly notif: Queue,
  ) {
    super();
  }

  async process(job: Job<SlaJobData>): Promise<void> {
    // varredura periódica (cross-tenant) — atualiza a métrica de prazos em risco
    if (job.name === JOB_SLA_SCAN) {
      return this.scanEmRisco();
    }

    const { tenantId, manifestacaoId, protocolo } = job.data;

    // Jobs rodam fora do ciclo HTTP → abrir o contexto de tenant manualmente
    // para que o RLS funcione nas queries do worker.
    await TenantContext.run({ tenantId }, async () => {
      const m = await this.prisma.db.manifestacao.findUnique({
        where: { id: manifestacaoId },
        select: { status: true, canal: true, responsavelId: true, solicitanteNome: true },
      });
      if (!m || ENCERRADOS.has(m.status)) {
        this.logger.debug(`SLA ${job.name} ignorado (${protocolo}): já encerrado/inexistente.`);
        return;
      }

      const vencido = job.name === JOB_SLA_VENCIDO;
      const acao = vencido ? 'SLA_PRAZO_VENCIDO' : 'SLA_ALERTA_PRAZO';

      // 1) Notifica o responsável via fila de notificações (multicanal).
      await this.notif.add(JOB_NOTIF_ENVIAR, {
        tenantId,
        manifestacaoId,
        protocolo,
        evento: vencido ? 'sla_vencido' : 'sla_proximo',
        destino: 'responsavel',
      });

      // 2) Registra na auditoria (prova de monitoramento de prazo legal).
      await this.prisma.db.auditLog.create({
        data: {
          tenantId,
          acao,
          entidade: 'manifestacao',
          entidadeId: manifestacaoId,
          dados: { protocolo, canal: m.canal, jobName: job.name },
        } as any,
      });

      this.logger.log(`${acao} processado para protocolo ${protocolo}.`);
    });
  }

  /**
   * Varredura cross-tenant das manifestações com prazo legal a vencer em até
   * 48h (modo plataforma — sem RLS de tenant). Atualiza a métrica Prometheus
   * `portal_sla_at_risk` e registra um resumo na auditoria. É a base do alerta
   * operacional de prazo (LAI/Lei 13.460).
   */
  private async scanEmRisco(): Promise<void> {
    const linhas = await this.prisma.platform().$queryRaw<
      { tenant_id: string; canal: string; n: number }[]
    >`
      SELECT tenant_id, canal::text AS canal, count(*)::int AS n
      FROM manifestacoes
      WHERE prazo_em < now() + interval '48 hours'
        AND status NOT IN ('respondida','indeferida','parcialmente_atendida','concluida','arquivada')
      GROUP BY tenant_id, canal`;

    slaAtRisk.reset();
    let total = 0;
    for (const l of linhas) {
      slaAtRisk.set({ tenant: l.tenant_id, canal: l.canal }, l.n);
      total += l.n;
    }

    if (total > 0) {
      await this.prisma.platform().auditLog.create({
        data: {
          tenantId: null,
          acao: 'SLA_SCAN_EM_RISCO',
          entidade: 'manifestacao',
          dados: { total, grupos: linhas.length },
        } as any,
      });
    }
    this.logger.log({ type: 'sla-scan', total, grupos: linhas.length });
  }

  /** Dead-letter: falhas que esgotaram tentativas vão para a auditoria. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<SlaJobData>, error: Error) {
    await TenantContext.run({ tenantId: job.data?.tenantId, isPlatform: !job.data?.tenantId }, () =>
      this.prisma.db.auditLog.create({
        data: {
          tenantId: job.data?.tenantId ?? null,
          acao: `${(job.name ?? 'sla').toUpperCase()}_FALHOU`,
          entidade: 'queue',
          entidadeId: job.id ?? null,
          dados: { erro: error.message, data: job.data },
        } as any,
      }),
    );
  }
}
