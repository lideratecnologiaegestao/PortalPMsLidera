/**
 * Service de Incidentes de Segurança (LGPD art. 48).
 * Acesso restrito a admin_prefeitura e ouvidor.
 * Todo acesso ao banco usa this.prisma.db.* (RLS automático por tenant).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  CriarIncidenteDto,
  AtualizarIncidenteDto,
  IncidenteStatus,
} from './lgpd.dto';
import { incidenteTransicionar, calcularPrazoComunicacao } from './lgpd-fsm';

const STATUS_NAO_ENCERRADOS: IncidenteStatus[] = [
  IncidenteStatus.REGISTRADO,
  IncidenteStatus.EM_AVALIACAO,
  IncidenteStatus.EM_CONTENCAO,
];

function derivarComunicacaoAtrasada(i: {
  status: string;
  prazoComunicacaoEm: Date;
}): boolean {
  return (
    STATUS_NAO_ENCERRADOS.includes(i.status as IncidenteStatus) &&
    new Date() > i.prazoComunicacaoEm
  );
}

@Injectable()
export class IncidentesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra um novo incidente de segurança. */
  async criar(adminId: string, dto: CriarIncidenteDto) {
    const tenantId = TenantContext.tenantId();

    const detectadoEm = dto.detectadoEm
      ? new Date(dto.detectadoEm)
      : new Date();

    const prazoComunicacaoEm = calcularPrazoComunicacao(
      detectadoEm,
      dto.severidade,
      dto.dadosAfetados,
    );

    const incidente = await this.prisma.db.incidenteSeguranca.create({
      data: {
        tenantId: tenantId!,
        titulo: dto.titulo,
        descricao: dto.descricao,
        categoria: dto.categoria,
        severidade: dto.severidade,
        dadosAfetados: dto.dadosAfetados,
        titularesAfetadosEstimados: dto.titularesAfetadosEstimados ?? null,
        ocorridoEm: dto.ocorridoEm ? new Date(dto.ocorridoEm) : null,
        detectadoEm,
        prazoComunicacaoEm,
        natureza: dto.natureza ?? null,
        riscoDescricao: dto.riscoDescricao ?? null,
        status: IncidenteStatus.REGISTRADO,
      },
    });

    // Auditoria (spec 4.5) — sem conteúdo pessoal
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: adminId,
        acao: 'INCIDENTE_REGISTRADO',
        entidade: 'incidentes_seguranca',
        entidadeId: incidente.id,
        dados: {
          categoria: dto.categoria,
          severidade: dto.severidade,
          incidenteId: incidente.id,
        },
      },
    });

    return {
      ...incidente,
      comunicacaoAtrasada: derivarComunicacaoAtrasada(incidente),
    };
  }

  /** Lista incidentes do tenant com filtros opcionais (RLS filtra tenant). */
  async listar(params: {
    status?: string;
    severidade?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const take = Math.min(100, params.pageSize ?? 20);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.severidade) where.severidade = params.severidade;

    const [items, total] = await Promise.all([
      this.prisma.db.incidenteSeguranca.findMany({
        where,
        skip,
        take,
        orderBy: { detectadoEm: 'desc' },
      }),
      this.prisma.db.incidenteSeguranca.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        ...i,
        comunicacaoAtrasada: derivarComunicacaoAtrasada(i),
      })),
      total,
      page,
      pageSize: take,
    };
  }

  /** Detalhe completo de um incidente. */
  async detalhe(id: string) {
    const i = await this.prisma.db.incidenteSeguranca.findUnique({
      where: { id },
      include: {
        responsavel: {
          select: { id: true, nome: true, email: true },
        },
      },
    });
    if (!i) throw new NotFoundException('Incidente não encontrado.');
    return { ...i, comunicacaoAtrasada: derivarComunicacaoAtrasada(i) };
  }

  /** Atualiza status, medidas, comunicação — com FSM e validações de negócio. */
  async atualizar(id: string, adminId: string, dto: AtualizarIncidenteDto) {
    const tenantId = TenantContext.tenantId();

    const atual = await this.prisma.db.incidenteSeguranca.findUnique({
      where: { id },
    });
    if (!atual) throw new NotFoundException('Incidente não encontrado.');

    const statusAnterior = atual.status;
    const statusNovo = dto.status;

    // Valida transição de estado (se houver mudança)
    if (statusNovo && statusNovo !== statusAnterior) {
      const resultado = incidenteTransicionar(statusAnterior, statusNovo);
      if (!resultado.ok) {
        throw new UnprocessableEntityException(resultado.erro);
      }

      // Ao encerrar baixa/média sem comunicação: exige medidasContencao + riscoDescricao
      if (statusNovo === IncidenteStatus.ENCERRADO) {
        const ehBaixaMedia =
          atual.severidade === 'baixa' || atual.severidade === 'media';
        if (ehBaixaMedia) {
          const medidasContencao = dto.medidasContencao ?? atual.medidasContencao;
          const riscoDescricao = dto.riscoDescricao ?? atual.riscoDescricao;
          if (!medidasContencao || !riscoDescricao) {
            throw new UnprocessableEntityException(
              'Para encerrar incidente de baixa/média severidade, ' +
                'preencha medidasContencao e riscoDescricao.',
            );
          }
        }
      }
    }

    const updated = await this.prisma.db.incidenteSeguranca.update({
      where: { id },
      data: {
        ...(statusNovo ? { status: statusNovo } : {}),
        ...(dto.medidasContencao !== undefined
          ? { medidasContencao: dto.medidasContencao }
          : {}),
        ...(dto.medidasMitigacao !== undefined
          ? { medidasMitigacao: dto.medidasMitigacao }
          : {}),
        ...(dto.riscoDescricao !== undefined
          ? { riscoDescricao: dto.riscoDescricao }
          : {}),
        ...(dto.riscoNivel !== undefined ? { riscoNivel: dto.riscoNivel } : {}),
        ...(dto.comunicadoAnpd !== undefined
          ? {
              comunicadoAnpd: dto.comunicadoAnpd,
              ...(dto.comunicadoAnpd
                ? {
                    comunicadoAnpdEm: dto.comunicadoAnpdEm
                      ? new Date(dto.comunicadoAnpdEm)
                      : new Date(),
                  }
                : {}),
            }
          : {}),
        ...(dto.comunicadoAnpdProtocolo !== undefined
          ? { comunicadoAnpdProtocolo: dto.comunicadoAnpdProtocolo }
          : {}),
        ...(dto.comunicadoTitulares !== undefined
          ? {
              comunicadoTitulares: dto.comunicadoTitulares,
              ...(dto.comunicadoTitulares
                ? {
                    comunicadoTitularesEm: dto.comunicadoTitularesEm
                      ? new Date(dto.comunicadoTitularesEm)
                      : new Date(),
                  }
                : {}),
            }
          : {}),
        ...(dto.comunicadoTitularesMeio !== undefined
          ? { comunicadoTitularesMeio: dto.comunicadoTitularesMeio }
          : {}),
        ...(dto.responsavelId !== undefined
          ? { responsavelId: dto.responsavelId }
          : {}),
        ...(dto.titularesAfetadosEstimados !== undefined
          ? { titularesAfetadosEstimados: dto.titularesAfetadosEstimados }
          : {}),
      },
    });

    // Auditoria por evento (spec 4.5)
    const auditorias: Promise<unknown>[] = [];

    if (statusNovo && statusNovo !== statusAnterior) {
      auditorias.push(
        this.prisma.db.auditLog.create({
          data: {
            tenantId: tenantId ?? null,
            atorId: adminId,
            acao: 'INCIDENTE_STATUS_ATUALIZADO',
            entidade: 'incidentes_seguranca',
            entidadeId: id,
            dados: { statusAnterior, statusNovo, incidenteId: id },
          },
        }),
      );
    }

    if (dto.comunicadoAnpd === true && !atual.comunicadoAnpd) {
      auditorias.push(
        this.prisma.db.auditLog.create({
          data: {
            tenantId: tenantId ?? null,
            atorId: adminId,
            acao: 'INCIDENTE_COMUNICADO_ANPD',
            entidade: 'incidentes_seguranca',
            entidadeId: id,
            dados: { incidenteId: id, comunicadoPor: adminId },
          },
        }),
      );
    }

    if (dto.comunicadoTitulares === true && !atual.comunicadoTitulares) {
      auditorias.push(
        this.prisma.db.auditLog.create({
          data: {
            tenantId: tenantId ?? null,
            atorId: adminId,
            acao: 'INCIDENTE_COMUNICADO_TITULARES',
            entidade: 'incidentes_seguranca',
            entidadeId: id,
            dados: { incidenteId: id, meio: dto.comunicadoTitularesMeio ?? null },
          },
        }),
      );
    }

    await Promise.all(auditorias);

    return {
      ...updated,
      comunicacaoAtrasada: derivarComunicacaoAtrasada(updated),
    };
  }

  /**
   * Exporta todos os campos do incidente como evidência documental para ANPD.
   * Registra auditoria INCIDENTE_RELATORIO_EXPORTADO (spec 4.5).
   */
  async relatorio(id: string, adminId: string) {
    const tenantId = TenantContext.tenantId();

    const i = await this.prisma.db.incidenteSeguranca.findUnique({
      where: { id },
      include: {
        responsavel: {
          select: { id: true, nome: true, email: true },
        },
      },
    });
    if (!i) throw new NotFoundException('Incidente não encontrado.');

    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: adminId,
        acao: 'INCIDENTE_RELATORIO_EXPORTADO',
        entidade: 'incidentes_seguranca',
        entidadeId: id,
        dados: { exportadoPor: adminId },
      },
    });

    return i;
  }
}
