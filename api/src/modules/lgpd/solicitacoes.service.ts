/**
 * Service de Solicitações do Titular (LGPD art. 18).
 * Todo acesso ao banco usa this.prisma.db.* (RLS automático por tenant).
 * titularId SEMPRE do JWT (user.sub) — nunca do body.
 */
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  CriarSolicitacaoDto,
  AtualizarSolicitacaoDto,
  SolicitacaoStatus,
} from './lgpd.dto';
import { solicitacaoTransicionar } from './lgpd-fsm';

const STATUS_ABERTOS: SolicitacaoStatus[] = [
  SolicitacaoStatus.ABERTA,
  SolicitacaoStatus.EM_ANDAMENTO,
  SolicitacaoStatus.ENCAMINHADA,
];

/** Máximo de solicitações abertas simultâneas por titular (spec 3.2 / §8). */
const MAX_ABERTAS_POR_TITULAR = 5;

/** Prazo legal de resposta: 15 dias corridos (LGPD art. 19). */
const PRAZO_DIAS = 15;

function adicionarDias(data: Date, dias: number): Date {
  const d = new Date(data.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

function derivarAtrasada(s: {
  status: string;
  prazoEm: Date;
}): boolean {
  return (
    STATUS_ABERTOS.includes(s.status as SolicitacaoStatus) &&
    new Date() > s.prazoEm
  );
}

@Injectable()
export class SolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cidadão cria uma nova solicitação de direito. titularId sempre de user.sub. */
  async criar(
    titularId: string,
    dto: CriarSolicitacaoDto,
  ) {
    const tenantId = TenantContext.tenantId();

    // Rate-limit de negócio: máx 5 abertas simultâneas por titular
    const abertas = await this.prisma.db.solicitacaoTitular.count({
      where: {
        titularId,
        status: { in: STATUS_ABERTOS as string[] },
      },
    });
    if (abertas >= MAX_ABERTAS_POR_TITULAR) {
      throw new HttpException(
        'Você já possui 5 solicitações em andamento. Aguarde a conclusão antes de abrir novas.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const agora = new Date();
    const prazoEm = adicionarDias(agora, PRAZO_DIAS);

    const solicitacao = await this.prisma.db.solicitacaoTitular.create({
      data: {
        tenantId: tenantId!,
        titularId,
        tipo: dto.tipo,
        descricao: dto.descricao ?? null,
        status: SolicitacaoStatus.ABERTA,
        prazoEm,
      },
    });

    // Auditoria — sem conteúdo pessoal (spec 3.6)
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: titularId,
        acao: 'SOLICITACAO_TITULAR_CRIADA',
        entidade: 'solicitacoes_titular',
        entidadeId: solicitacao.id,
        dados: { tipo: dto.tipo, solicitacaoId: solicitacao.id },
      },
    });

    return { ...solicitacao, atrasada: false };
  }

  /** Lista as próprias solicitações do titular (paginado). */
  async listarProprias(
    titularId: string,
    page = 1,
    pageSize = 20,
  ) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, pageSize);
    const take = Math.min(100, pageSize);

    const [items, total] = await Promise.all([
      this.prisma.db.solicitacaoTitular.findMany({
        where: { titularId },
        skip,
        take,
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.db.solicitacaoTitular.count({ where: { titularId } }),
    ]);

    return {
      items: items.map((s) => ({ ...s, atrasada: derivarAtrasada(s) })),
      total,
      page,
      pageSize: take,
    };
  }

  /** Detalhe de uma solicitação própria. Garante que pertence ao titular. */
  async detalhe(titularId: string, id: string) {
    const s = await this.prisma.db.solicitacaoTitular.findUnique({
      where: { id },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    // RLS já filtra o tenant; aqui garantimos que é do titular.
    if (s.titularId !== titularId) {
      throw new ForbiddenException(
        'Você não tem acesso a esta solicitação.',
      );
    }
    return { ...s, atrasada: derivarAtrasada(s) };
  }

  /** Admin/Ouvidor lista todas as solicitações do tenant (RLS filtra por tenant). */
  async listarAdmin(params: {
    status?: string;
    tipo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const take = Math.min(100, params.pageSize ?? 20);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.tipo) where.tipo = params.tipo;

    const [items, total] = await Promise.all([
      this.prisma.db.solicitacaoTitular.findMany({
        where,
        skip,
        take,
        orderBy: { criadoEm: 'desc' },
        include: {
          titular: {
            select: { id: true, nome: true, email: true },
          },
        },
      }),
      this.prisma.db.solicitacaoTitular.count({ where }),
    ]);

    return {
      items: items.map((s) => ({ ...s, atrasada: derivarAtrasada(s) })),
      total,
      page,
      pageSize: take,
    };
  }

  /** Admin/Ouvidor: detalhe completo + dados do titular. */
  async detalheAdmin(id: string) {
    const s = await this.prisma.db.solicitacaoTitular.findUnique({
      where: { id },
      include: {
        titular: {
          select: { id: true, nome: true, email: true, telefone: true, role: true },
        },
        tratadoPorUser: {
          select: { id: true, nome: true, email: true },
        },
      },
    });
    if (!s) throw new NotFoundException('Solicitação não encontrada.');
    return { ...s, atrasada: derivarAtrasada(s) };
  }

  /** Admin/Ouvidor: atualiza status/resposta/motivo de indeferimento. */
  async atualizarAdmin(
    id: string,
    adminId: string,
    dto: AtualizarSolicitacaoDto,
  ) {
    const tenantId = TenantContext.tenantId();

    const atual = await this.prisma.db.solicitacaoTitular.findUnique({
      where: { id },
    });
    if (!atual) throw new NotFoundException('Solicitação não encontrada.');

    const statusAnterior = atual.status;

    // Valida transição de estado
    if (dto.status && dto.status !== statusAnterior) {
      const resultado = solicitacaoTransicionar(statusAnterior, dto.status);
      if (!resultado.ok) {
        throw new UnprocessableEntityException(resultado.erro);
      }
    }

    // Se indeferindo, motivo é obrigatório
    if (
      dto.status === SolicitacaoStatus.INDEFERIDA &&
      !dto.indeferimentoMotivo &&
      !atual.indeferimentoMotivo
    ) {
      throw new UnprocessableEntityException(
        'indeferimentoMotivo é obrigatório ao indeferir uma solicitação.',
      );
    }

    const isFinalizado =
      dto.status === SolicitacaoStatus.CONCLUIDA ||
      dto.status === SolicitacaoStatus.INDEFERIDA;

    const updated = await this.prisma.db.solicitacaoTitular.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.resposta !== undefined ? { resposta: dto.resposta } : {}),
        ...(dto.indeferimentoMotivo !== undefined
          ? { indeferimentoMotivo: dto.indeferimentoMotivo }
          : {}),
        ...(isFinalizado
          ? { tratadoPor: adminId, tratadoEm: new Date() }
          : {}),
      },
    });

    // Auditoria — sem conteúdo pessoal (spec 3.6)
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: adminId,
        acao: 'SOLICITACAO_TITULAR_ATUALIZADA',
        entidade: 'solicitacoes_titular',
        entidadeId: id,
        dados: {
          statusAnterior,
          statusNovo: dto.status ?? statusAnterior,
          tratadoPor: adminId,
        },
      },
    });

    return { ...updated, atrasada: derivarAtrasada(updated) };
  }

  /**
   * Anonimização do titular (spec 3.4).
   * Executa sobre o titular DA solicitação. Deve ser tipo 'eliminacao' mas
   * o admin pode acionar para qualquer solicitação — a verificação de tipo
   * é feita no controller.
   *
   * Tudo numa transação para consistência (LGPD art. 18, IV + art. 16).
   */
  async anonimizarTitular(solicitacaoId: string, adminId: string) {
    const tenantId = TenantContext.tenantId();

    const solicitacao = await this.prisma.db.solicitacaoTitular.findUnique({
      where: { id: solicitacaoId },
      include: { titular: true },
    });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada.');

    const titularId = solicitacao.titularId;
    const emailAnonimizado = `${titularId}@anonimizado.invalid`;
    const camposAnonimizados: string[] = [];

    await this.prisma.tx(async (tx) => {
      // 1. Anonimiza a conta do usuário (id preservado para integridade referencial)
      await tx.user.update({
        where: { id: titularId },
        data: {
          nome: '[TITULAR ANONIMIZADO]',
          email: emailAnonimizado,
          telefone: null,
          cpfHash: null,
          govbrSub: null,
          govbrNivel: null,
          avatarStorageKey: null,
          ativo: false,
        },
      });
      camposAnonimizados.push('nome', 'email', 'telefone', 'cpf_hash', 'govbr_sub', 'govbr_nivel', 'avatar_storage_key', 'ativo');

      // 2. Limpa user_contatos (sem guarda obrigatória própria)
      await tx.userContato.updateMany({
        where: { userId: titularId },
        data: { whatsapp: null, email: null },
      });
      camposAnonimizados.push('user_contatos.whatsapp', 'user_contatos.email');

      // 3. Remove alertas de diário do titular (dado de consentimento revogável).
      // DiarioAlerta é ligado por 'destino' (email), não por userId.
      // A spec permite exclusão física aqui pois não há guarda obrigatória.
      const emailOriginal = solicitacao.titular.email;
      await tx.diarioAlerta.deleteMany({
        where: { destino: emailOriginal },
      });
      camposAnonimizados.push('diario_alertas.destino');

      // 4. Anonimiza manifestações já arquivadas do titular
      // (ManifestacaoStatus: o status terminal é 'arquivada'; as em prazo legal
      //  obrigatório ficam para o job de expurgo)
      await tx.manifestacao.updateMany({
        where: {
          cidadaoId: titularId,
          status: 'arquivada' as any,
        },
        data: {
          solicitanteNome: null,
          solicitanteEmail: null,
        },
      });
      camposAnonimizados.push('manifestacoes.solicitante_nome', 'manifestacoes.solicitante_email');

      // 5. Marca solicitação como concluída com resposta padrão da spec
      await tx.solicitacaoTitular.update({
        where: { id: solicitacaoId },
        data: {
          status: SolicitacaoStatus.CONCLUIDA,
          resposta:
            'Seus dados de identificação foram removidos do sistema. ' +
            'Registros de processos administrativos são mantidos em forma anonimizada ' +
            'pelo prazo legal obrigatório, sem possibilidade de vinculação à sua identidade.',
          tratadoPor: adminId,
          tratadoEm: new Date(),
        },
      });

      // 6. Auditoria — sem PII (spec 3.6)
      await tx.auditLog.create({
        data: {
          tenantId: tenantId ?? null,
          atorId: adminId,
          acao: 'TITULAR_ANONIMIZADO',
          entidade: 'users',
          entidadeId: titularId,
          dados: {
            camposAnonimizados,
            solicitacaoId,
          },
        },
      });
    });

    return { ok: true, camposAnonimizados };
  }
}
