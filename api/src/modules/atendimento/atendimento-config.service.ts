import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

export interface ConfigAtendimentoInput {
  atendimentoHumanoAtivo?: boolean;
  iaChatWidgetAtivo?: boolean;
  atendimentoAvisoLgpd?: string;
  atendimentoMensagemForaExp?: string;
  atendimentoSaudacao?: string;
  atendimentoInatividadeMin?: number;
  atendimentoTimezone?: string;
  evolutionInstancia?: string;
}

export interface HorarioInput {
  diaSemana: number;  // 0-6
  horaInicio: string; // HH:MM
  horaFim: string;    // HH:MM
  ativo: boolean;
}

/**
 * Configuração de atendimento do tenant: flags, mensagens, timezone,
 * inatividade e horários de expediente.
 */
@Injectable()
export class AtendimentoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const tenant = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: {
        atendimentoHumanoAtivo: true,
        iaChatWidgetAtivo: true,
        atendimentoAvisoLgpd: true,
        atendimentoMensagemForaExp: true,
        atendimentoSaudacao: true,
        atendimentoInatividadeMin: true,
        atendimentoTimezone: true,
        evolutionInstancia: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');
    return tenant;
  }

  async putConfig(tenantId: string, dados: ConfigAtendimentoInput) {
    return this.prisma.platform().tenant.update({
      where: { id: tenantId },
      data: {
        atendimentoHumanoAtivo: dados.atendimentoHumanoAtivo,
        iaChatWidgetAtivo: dados.iaChatWidgetAtivo,
        atendimentoAvisoLgpd: dados.atendimentoAvisoLgpd,
        atendimentoMensagemForaExp: dados.atendimentoMensagemForaExp,
        atendimentoSaudacao: dados.atendimentoSaudacao,
        atendimentoInatividadeMin: dados.atendimentoInatividadeMin,
        atendimentoTimezone: dados.atendimentoTimezone,
        evolutionInstancia: dados.evolutionInstancia,
      },
      select: {
        atendimentoHumanoAtivo: true,
        iaChatWidgetAtivo: true,
        atendimentoAvisoLgpd: true,
        atendimentoMensagemForaExp: true,
        atendimentoSaudacao: true,
        atendimentoInatividadeMin: true,
        atendimentoTimezone: true,
        evolutionInstancia: true,
      },
    });
  }

  /**
   * Upsert de horários: recebe array de 7 entradas (um por dia da semana).
   * Cria se não existir, atualiza se existir.
   */
  async putHorario(tenantId: string, horario: HorarioInput[]) {
    const ops = horario.map((h) => {
      const [hiH, hiM] = h.horaInicio.split(':').map(Number);
      const [hfH, hfM] = h.horaFim.split(':').map(Number);
      const horaInicio = new Date(1970, 0, 1, hiH, hiM, 0);
      const horaFim = new Date(1970, 0, 1, hfH, hfM, 0);
      return this.prisma.platform().atendimentoHorario.upsert({
        where: { tenantId_diaSemana: { tenantId, diaSemana: h.diaSemana } },
        create: { tenantId, diaSemana: h.diaSemana, horaInicio, horaFim, ativo: h.ativo },
        update: { horaInicio, horaFim, ativo: h.ativo },
      });
    });
    return Promise.all(ops);
  }

  /** Configuração pública do widget (sem dados sensíveis). */
  async configPublica(tenantId: string) {
    const tenant = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: {
        atendimentoHumanoAtivo: true,
        atendimentoAvisoLgpd: true,
        atendimentoSaudacao: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const horarios = await this.prisma.platform().atendimentoHorario.findMany({
      where: { tenantId },
      orderBy: { diaSemana: 'asc' },
    });

    return {
      ativo: tenant.atendimentoHumanoAtivo,
      avisoLgpd: tenant.atendimentoAvisoLgpd,
      saudacao: tenant.atendimentoSaudacao,
      expediente: horarios.map((h) => ({
        diaSemana: h.diaSemana,
        horaInicio: `${String(h.horaInicio.getHours()).padStart(2, '0')}:${String(h.horaInicio.getMinutes()).padStart(2, '0')}`,
        horaFim: `${String(h.horaFim.getHours()).padStart(2, '0')}:${String(h.horaFim.getMinutes()).padStart(2, '0')}`,
        ativo: h.ativo,
      })),
    };
  }

  // ------------------------------------------------------------------ tags

  async listarTags(tenantId: string) {
    return TenantContext.run({ tenantId }, () =>
      this.prisma.db.atendimentoTag.findMany({ orderBy: { nome: 'asc' } }),
    );
  }

  async criarTag(tenantId: string, dados: { nome: string; cor?: string }) {
    return TenantContext.run({ tenantId }, () =>
      this.prisma.db.atendimentoTag.create({
        data: { tenantId, nome: dados.nome, cor: dados.cor ?? '#6B7280' },
      }),
    );
  }

  async excluirTag(tenantId: string, tagId: string) {
    return TenantContext.run({ tenantId }, () =>
      this.prisma.db.atendimentoTag.delete({ where: { id: tagId } }),
    );
  }
}
