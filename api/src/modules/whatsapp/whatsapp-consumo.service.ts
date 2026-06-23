import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

// ---------------------------------------------------------------- DTOs

export interface SalvarCotaDto {
  creditosTotal: number;
  alertaPercentual: number;
  cicloDia: number;
}

export interface ResumoConsumo {
  creditosTotal: number;
  usadosCiclo: number;
  restante: number;
  percentual: number;
  alerta: boolean;
  cicloInicio: string;         // 'YYYY-MM-DD'
  porTemplate: { nome: string; n: number }[];
  porCanal: { canalId: string; label: string; n: number }[];
  serie: { dia: string; n: number }[];  // últimos 30 dias
}

/**
 * Calcula o início do ciclo de cobrança atual baseado em `cicloDia`.
 * Se hoje >= cicloDia → ciclo começou neste mês no dia cicloDia.
 * Senão → ciclo começou no mês anterior no dia cicloDia.
 */
function calcularCicloInicio(cicloDia: number): Date {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based

  if (diaHoje >= cicloDia) {
    return new Date(ano, mes, cicloDia);
  } else {
    // mês anterior
    return new Date(ano, mes - 1, cicloDia);
  }
}

/**
 * Serviço de consumo de templates e cota por tenant.
 *
 * `resumo` agrega os envios do ciclo atual (baseado em cicloDia da cota).
 * `getCota` / `salvarCota` fazem upsert na tenant_whatsapp_cota (singleton por tenant).
 *
 * Todas as queries passam por TenantContext (RLS automático).
 */
@Injectable()
export class WhatsappConsumoService {
  private readonly log = new Logger(WhatsappConsumoService.name);

  // Defaults quando não há linha de cota cadastrada
  private readonly DEFAULT_COTA = { creditosTotal: 0, alertaPercentual: 80, cicloDia: 1 };

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- Cota

  async getCota(tenantId: string): Promise<{
    creditosTotal: number;
    alertaPercentual: number;
    cicloDia: number;
  }> {
    const row = await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCota.findUnique({ where: { tenantId } }),
    );
    if (!row) return { ...this.DEFAULT_COTA };
    return {
      creditosTotal: row.creditosTotal,
      alertaPercentual: row.alertaPercentual,
      cicloDia: row.cicloDia,
    };
  }

  async salvarCota(tenantId: string, dto: SalvarCotaDto): Promise<void> {
    this.validarCotaDto(dto);
    await TenantContext.run({ tenantId }, () =>
      this.prisma.db.tenantWhatsappCota.upsert({
        where: { tenantId },
        create: {
          tenantId,
          creditosTotal: dto.creditosTotal,
          alertaPercentual: dto.alertaPercentual,
          cicloDia: dto.cicloDia,
        },
        update: {
          creditosTotal: dto.creditosTotal,
          alertaPercentual: dto.alertaPercentual,
          cicloDia: dto.cicloDia,
        },
      }),
    );
  }

  // ---------------------------------------------------------------- Resumo

  async resumo(tenantId: string): Promise<ResumoConsumo> {
    const cota = await this.getCota(tenantId);
    const cicloInicio = calcularCicloInicio(cota.cicloDia);
    const cicloInicioStr = cicloInicio.toISOString().slice(0, 10);

    // Serie: últimos 30 dias (calendário, independente do ciclo)
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 29);
    trintaDiasAtras.setHours(0, 0, 0, 0);

    // Todas as queries são RLS-scoped (TenantContext garante current_tenant_id)
    const [totalCicloRows, porTemplateRows, porCanalRows, serieRows] = await TenantContext.run(
      { tenantId },
      async () => {
        const total = await this.prisma.db.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n
          FROM whatsapp_template_envios
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'enviado'
            AND criado_em >= ${cicloInicio}
        `;

        const porTemplate = await this.prisma.db.$queryRaw<{ nome: string; n: bigint }[]>`
          SELECT template_nome AS nome, COUNT(*)::bigint AS n
          FROM whatsapp_template_envios
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'enviado'
            AND criado_em >= ${cicloInicio}
          GROUP BY template_nome
          ORDER BY n DESC
        `;

        const porCanal = await this.prisma.db.$queryRaw<{
          canal_id: string;
          label: string;
          n: bigint;
        }[]>`
          SELECT e.canal_id,
                 COALESCE(c.label, 'desconhecido') AS label,
                 COUNT(*)::bigint AS n
          FROM whatsapp_template_envios e
          LEFT JOIN tenant_whatsapp_canais c ON c.id = e.canal_id
          WHERE e.tenant_id = ${tenantId}::uuid
            AND e.status = 'enviado'
            AND e.criado_em >= ${cicloInicio}
          GROUP BY e.canal_id, c.label
          ORDER BY n DESC
        `;

        const serie = await this.prisma.db.$queryRaw<{ dia: string; n: bigint }[]>`
          SELECT TO_CHAR(DATE_TRUNC('day', criado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS dia,
                 COUNT(*)::bigint AS n
          FROM whatsapp_template_envios
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'enviado'
            AND criado_em >= ${trintaDiasAtras}
          GROUP BY DATE_TRUNC('day', criado_em AT TIME ZONE 'UTC')
          ORDER BY dia ASC
        `;

        return [total, porTemplate, porCanal, serie] as const;
      },
    );

    const usadosCiclo = Number(totalCicloRows[0]?.n ?? 0);
    const creditosTotal = cota.creditosTotal;
    const restante = Math.max(0, creditosTotal - usadosCiclo);
    const percentual =
      creditosTotal > 0 ? Math.round((usadosCiclo / creditosTotal) * 100 * 100) / 100 : 0;
    const alerta = creditosTotal > 0 && percentual >= cota.alertaPercentual;

    return {
      creditosTotal,
      usadosCiclo,
      restante,
      percentual,
      alerta,
      cicloInicio: cicloInicioStr,
      porTemplate: porTemplateRows.map((r) => ({ nome: r.nome, n: Number(r.n) })),
      porCanal: porCanalRows.map((r) => ({
        canalId: r.canal_id,
        label: r.label,
        n: Number(r.n),
      })),
      serie: serieRows.map((r) => ({ dia: r.dia, n: Number(r.n) })),
    };
  }

  // ---------------------------------------------------------------- helpers

  private validarCotaDto(dto: SalvarCotaDto): void {
    if (!Number.isInteger(dto.creditosTotal) || dto.creditosTotal < 0) {
      throw new BadRequestException('creditosTotal deve ser inteiro >= 0.');
    }
    if (
      !Number.isInteger(dto.alertaPercentual) ||
      dto.alertaPercentual < 1 ||
      dto.alertaPercentual > 100
    ) {
      throw new BadRequestException('alertaPercentual deve ser inteiro entre 1 e 100.');
    }
    if (!Number.isInteger(dto.cicloDia) || dto.cicloDia < 1 || dto.cicloDia > 28) {
      throw new BadRequestException('cicloDia deve ser inteiro entre 1 e 28.');
    }
  }
}
