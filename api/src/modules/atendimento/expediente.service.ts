import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExpedientePublicoItem {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
}

/**
 * Consulta o expediente de atendimento do tenant considerando seu timezone.
 * Usa Intl.DateTimeFormat para obter dia e hora locais do tenant, independente
 * do timezone do servidor.
 */
@Injectable()
export class ExpedienteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica se o momento atual está dentro do expediente do tenant.
   * Usa o atendimento_timezone do tenant para calcular dia/hora locais.
   */
  async dentroDoExpediente(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma
      .platform()
      .tenant.findUnique({
        where: { id: tenantId },
        select: { atendimentoTimezone: true },
      });
    if (!tenant) return false;

    const timezone = tenant.atendimentoTimezone ?? 'America/Cuiaba';
    const agora = new Date();

    // Obtém dia da semana (0=dom, 1=seg, ... 6=sab) no timezone do tenant
    const diasPartes = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(agora);
    const diaAbrev = diasPartes.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const diaSemanaLocal = this.diaSemanaAbrevParaNum(diaAbrev);

    // Obtém horas e minutos no timezone do tenant
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(agora);

    const horas = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
    const mins = Number(partes.find((p) => p.type === 'minute')?.value ?? '0');
    const minutosAgora = horas * 60 + mins;

    const horarios = await this.prisma
      .platform()
      .atendimentoHorario.findMany({
        where: { tenantId, diaSemana: diaSemanaLocal, ativo: true },
      });

    for (const horario of horarios) {
      const ini = horario.horaInicio.getHours() * 60 + horario.horaInicio.getMinutes();
      const fim = horario.horaFim.getHours() * 60 + horario.horaFim.getMinutes();
      if (minutosAgora >= ini && minutosAgora < fim) return true;
    }
    return false;
  }

  /** Lista os horários de expediente para exibição pública. */
  async expedientePublico(tenantId: string): Promise<ExpedientePublicoItem[]> {
    const horarios = await this.prisma
      .platform()
      .atendimentoHorario.findMany({
        where: { tenantId },
        orderBy: { diaSemana: 'asc' },
      });
    return horarios.map((h) => ({
      diaSemana: h.diaSemana,
      horaInicio: `${String(h.horaInicio.getHours()).padStart(2, '0')}:${String(h.horaInicio.getMinutes()).padStart(2, '0')}`,
      horaFim: `${String(h.horaFim.getHours()).padStart(2, '0')}:${String(h.horaFim.getMinutes()).padStart(2, '0')}`,
      ativo: h.ativo,
    }));
  }

  private diaSemanaAbrevParaNum(abrev: string): number {
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[abrev] ?? 0;
  }
}
