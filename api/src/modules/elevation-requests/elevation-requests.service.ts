import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  PAPEIS_ADMIN_TENANT,
  PAPEIS_SUPER_ADMIN,
  SolicitarElevacaoDto,
} from './elevation-requests.dto';

/** Projeção para o solicitante (próprias solicitações). */
const SELECT_PROPRIO = {
  id: true,
  papelSolicitado: true,
  cargoDeclarado: true,
  justificativa: true,
  status: true,
  motivoRecusa: true,
  aprovadoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  lotacaoSecretaria: {
    select: { id: true, nome: true },
  },
} as const;

/** Projeção para admins (inclui dados do solicitante + secretaria). */
const SELECT_ADMIN = {
  id: true,
  tenantId: true,
  papelSolicitado: true,
  cargoDeclarado: true,
  justificativa: true,
  status: true,
  motivoRecusa: true,
  aprovadoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  solicitante: {
    select: { id: true, nome: true, email: true, role: true },
  },
  lotacaoSecretaria: {
    select: { id: true, nome: true },
  },
  aprovadorUser: {
    select: { id: true, nome: true },
  },
} as const;

/**
 * Service de Solicitações de Elevação de Papel (ADR-0005 Fase 2).
 *
 * Regras de negócio:
 *  - Cidadão/servidor solicita → status 'pendente'.
 *  - Papéis gestor/servidor: aprovados pelo admin_prefeitura/gestor via /admin.
 *  - Papéis ouvidor/assistente_ouvidoria/ti: aprovados pelo super_admin via /_platform.
 *  - Ao aprovar: seta users.role + users.secretaria_id em transação atômica.
 *  - Pendências com > 30 dias: expiradas pelo worker diário.
 *
 * Acesso a dados:
 *  - Operações de tenant  → this.prisma.db (RLS automático)
 *  - Operações cross-tenant → TenantContext.run({ isPlatform: true }) + this.prisma.tx()
 *    ou this.prisma.platform() para queries simples.
 */
@Injectable()
export class ElevationRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- cidadão

  /**
   * Cria uma solicitação de elevação para o usuário logado.
   * 409 se já houver pendente idêntica (unicidade parcial no índice DB).
   */
  async solicitar(userId: string, tenantId: string, dto: SolicitarElevacaoDto) {
    // Verificação de duplicata (defesa dupla — o índice único do DB também rejeita)
    const existente = await this.prisma.db.elevationRequest.findFirst({
      where: { userId, papelSolicitado: dto.papelSolicitado as any, status: 'pendente' },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException(
        `Você já possui uma solicitação pendente para o papel '${dto.papelSolicitado}'. Aguarde a análise ou cancele a anterior.`,
      );
    }

    const request = await this.prisma.db.elevationRequest.create({
      data: {
        tenantId,
        userId,
        papelSolicitado: dto.papelSolicitado as any,
        cargoDeclarado: dto.cargoDeclarado ?? null,
        lotacaoSecretariaId: dto.lotacaoSecretariaId ?? null,
        justificativa: dto.justificativa ?? null,
        status: 'pendente',
      },
      select: SELECT_PROPRIO,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: userId,
        acao: 'ELEVACAO_SOLICITADA',
        entidade: 'elevation_requests',
        entidadeId: request.id,
        dados: { papelSolicitado: dto.papelSolicitado },
      },
    });

    return request;
  }

  /** Lista as solicitações do próprio usuário (todas as situações), mais recentes primeiro. */
  async minhasSolicitacoes(userId: string) {
    return this.prisma.db.elevationRequest.findMany({
      where: { userId },
      select: SELECT_PROPRIO,
      orderBy: { criadoEm: 'desc' },
    });
  }

  // ---------------------------------------------------------------- admin_prefeitura / gestor (painel admin)

  /**
   * Lista solicitações do tenant com papel_solicitado ∈ {gestor, servidor}.
   * admin_prefeitura/gestor NÃO veem solicitações de ouvidor/assistente/ti.
   * RLS garante isolamento de tenant automaticamente.
   */
  async listarParaAdmin(tenantId: string, status?: string) {
    const statusFiltro = status ?? 'pendente';
    return this.prisma.db.elevationRequest.findMany({
      where: {
        status: statusFiltro,
        papelSolicitado: { in: [...PAPEIS_ADMIN_TENANT] as any[] },
      },
      select: SELECT_ADMIN,
      orderBy: { criadoEm: 'desc' },
    });
  }

  /**
   * Aprova uma solicitação de gestor/servidor.
   * Em transação: atualiza elevation_requests + users.role + users.secretaria_id.
   * 403 se o papel for ouvidor/assistente/ti (precisa de super_admin).
   */
  async aprovarAdmin(id: string, aprovadorId: string, tenantId: string) {
    const req = await this.prisma.db.elevationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        papelSolicitado: true,
        status: true,
        lotacaoSecretariaId: true,
        tenantId: true,
      },
    });
    if (!req) throw new NotFoundException('Solicitação não encontrada.');
    // RLS já garante isolamento, mas validamos explicitamente por segurança
    if (req.status !== 'pendente') throw new ConflictException('Solicitação não está pendente.');

    const papel = req.papelSolicitado as string;
    if ((PAPEIS_SUPER_ADMIN as readonly string[]).includes(papel)) {
      throw new ForbiddenException(
        `O papel '${papel}' deve ser aprovado pelo super_admin via Gerenciador da Plataforma.`,
      );
    }

    await this.prisma.tx(async (tx) => {
      await tx.elevationRequest.update({
        where: { id },
        data: {
          status: 'aprovada',
          aprovadoPor: aprovadorId,
          aprovadoEm: new Date(),
        },
      });
      await tx.user.update({
        where: { id: req.userId },
        data: {
          role: req.papelSolicitado,
          ...(req.lotacaoSecretariaId ? { secretariaId: req.lotacaoSecretariaId } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          atorId: aprovadorId,
          acao: 'ELEVACAO_APROVADA',
          entidade: 'elevation_requests',
          entidadeId: id,
          dados: { papel, userId: req.userId },
        },
      });
    });

    return { ok: true };
  }

  /** Recusa uma solicitação com motivo (admin_prefeitura/gestor). */
  async recusarAdmin(id: string, aprovadorId: string, tenantId: string, motivo: string) {
    const req = await this.prisma.db.elevationRequest.findUnique({
      where: { id },
      select: { id: true, status: true, papelSolicitado: true, tenantId: true, userId: true },
    });
    if (!req) throw new NotFoundException('Solicitação não encontrada.');
    if (req.status !== 'pendente') throw new ConflictException('Solicitação não está pendente.');

    const papel = req.papelSolicitado as string;
    if ((PAPEIS_SUPER_ADMIN as readonly string[]).includes(papel)) {
      throw new ForbiddenException(
        `O papel '${papel}' deve ser gerenciado pelo super_admin via Gerenciador da Plataforma.`,
      );
    }

    await this.prisma.tx(async (tx) => {
      await tx.elevationRequest.update({
        where: { id },
        data: {
          status: 'recusada',
          motivoRecusa: motivo,
          aprovadoPor: aprovadorId,
          aprovadoEm: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          atorId: aprovadorId,
          acao: 'ELEVACAO_RECUSADA',
          entidade: 'elevation_requests',
          entidadeId: id,
          dados: { papel, userId: req.userId, motivo },
        },
      });
    });

    return { ok: true };
  }

  // ---------------------------------------------------------------- super_admin (/_platform — cross-tenant)

  /**
   * Lista solicitações cross-tenant para papéis ouvidor/assistente_ouvidoria/ti.
   * Usa prisma.platform() para varrer todos os tenants sem RLS de tenant.
   * Justificativa cross-tenant: super_admin deve aprovar papéis sensíveis de todos os tenants.
   */
  async listarParaSuperAdmin(status?: string) {
    const statusFiltro = status ?? 'pendente';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma.platform().elevationRequest as any).findMany({
      where: {
        status: statusFiltro,
        papelSolicitado: { in: [...PAPEIS_SUPER_ADMIN] },
      },
      select: {
        ...SELECT_ADMIN,
        tenant: { select: { id: true, nome: true, slug: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  /**
   * Aprova solicitação de ouvidor/assistente_ouvidoria/ti (cross-tenant).
   * Usa TenantContext.run({ isPlatform: true }) + prisma.tx() para transação com
   * GUC app.is_platform = on — garantindo que o RLS de tenant não bloqueie.
   *
   * Justificativa cross-tenant: super_admin é responsável por esses papéis sensíveis;
   * a operação modifica dados do tenant-alvo intencionalmente.
   */
  async aprovarSuperAdmin(id: string, aprovadorId: string) {
    // Lê cross-tenant para obter o tenantId da solicitação
    const req = await this.prisma.platform().elevationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        papelSolicitado: true,
        status: true,
        lotacaoSecretariaId: true,
        tenantId: true,
      },
    });
    if (!req) throw new NotFoundException('Solicitação não encontrada.');
    if (req.status !== 'pendente') throw new ConflictException('Solicitação não está pendente.');

    const papel = req.papelSolicitado as string;
    if (!(PAPEIS_SUPER_ADMIN as readonly string[]).includes(papel)) {
      throw new ForbiddenException(
        `O papel '${papel}' deve ser aprovado pelo admin_prefeitura no painel da entidade.`,
      );
    }

    // Transação no contexto de plataforma (sem RLS de tenant)
    await TenantContext.run({ isPlatform: true }, () =>
      this.prisma.tx(async (tx) => {
        await tx.elevationRequest.update({
          where: { id },
          data: {
            status: 'aprovada',
            aprovadoPor: aprovadorId,
            aprovadoEm: new Date(),
          },
        });
        await tx.user.update({
          where: { id: req.userId },
          data: {
            role: req.papelSolicitado,
            ...(req.lotacaoSecretariaId ? { secretariaId: req.lotacaoSecretariaId } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.tenantId,
            atorId: aprovadorId,
            acao: 'ELEVACAO_APROVADA',
            entidade: 'elevation_requests',
            entidadeId: id,
            dados: { papel, userId: req.userId, via: 'super_admin' },
          },
        });
      }),
    );

    return { ok: true };
  }

  /** Recusa solicitação de ouvidor/assistente/ti (cross-tenant). */
  async recusarSuperAdmin(id: string, aprovadorId: string, motivo: string) {
    const req = await this.prisma.platform().elevationRequest.findUnique({
      where: { id },
      select: { id: true, status: true, papelSolicitado: true, tenantId: true, userId: true },
    });
    if (!req) throw new NotFoundException('Solicitação não encontrada.');
    if (req.status !== 'pendente') throw new ConflictException('Solicitação não está pendente.');

    const papel = req.papelSolicitado as string;
    if (!(PAPEIS_SUPER_ADMIN as readonly string[]).includes(papel)) {
      throw new ForbiddenException(
        `O papel '${papel}' deve ser gerenciado pelo admin_prefeitura no painel da entidade.`,
      );
    }

    await TenantContext.run({ isPlatform: true }, () =>
      this.prisma.tx(async (tx) => {
        await tx.elevationRequest.update({
          where: { id },
          data: {
            status: 'recusada',
            motivoRecusa: motivo,
            aprovadoPor: aprovadorId,
            aprovadoEm: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.tenantId,
            atorId: aprovadorId,
            acao: 'ELEVACAO_RECUSADA',
            entidade: 'elevation_requests',
            entidadeId: id,
            dados: { papel, userId: req.userId, motivo, via: 'super_admin' },
          },
        });
      }),
    );

    return { ok: true };
  }

  // ---------------------------------------------------------------- worker de expiração

  /**
   * Expira pendências com mais de 30 dias (chamado pelo worker BullMQ 1x/dia).
   * Varre cross-tenant via prisma.platform().
   * Deve ser chamado dentro de TenantContext.run({ isPlatform: true }).
   */
  async expirarPendentes(): Promise<number> {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Busca as pendentes expiradas para auditar individualmente
    const pendentes = await this.prisma.platform().elevationRequest.findMany({
      where: { status: 'pendente', criadoEm: { lt: limite } },
      select: { id: true, tenantId: true, userId: true, papelSolicitado: true },
    });

    if (pendentes.length === 0) return 0;

    // Atualiza em lote (dentro do contexto de plataforma já ativo no caller)
    await this.prisma.platform().elevationRequest.updateMany({
      where: { status: 'pendente', criadoEm: { lt: limite } },
      data: { status: 'expirada' },
    });

    // Auditoria por registro (cross-tenant — usa platform())
    for (const p of pendentes) {
      await this.prisma.platform().auditLog.create({
        data: {
          tenantId: p.tenantId,
          atorId: null,
          acao: 'ELEVACAO_EXPIRADA',
          entidade: 'elevation_requests',
          entidadeId: p.id,
          dados: {
            papelSolicitado: p.papelSolicitado,
            userId: p.userId,
            via: 'worker',
          },
        },
      });
    }

    return pendentes.length;
  }
}
