import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { SessionsService } from './sessions.service';

/**
 * Painel admin de sessoes ativas + revogacao server-side.
 * Restrito a ADMIN_PREFEITURA e GESTOR.
 *
 * GET  /admin/sessoes          — lista sessoes ativas do tenant
 * GET  /admin/sessoes/online   — contagem de usuarios online agora
 * POST /admin/sessoes/:id/revogar — revoga sessao especifica (auditado)
 */
@Controller('admin/sessoes')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listar() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new NotFoundException('Tenant nao identificado.');
    return this.sessions.listarAtivas(tenantId);
  }

  /** Rota literal antes de :id — registrada ANTES do :id no controller. */
  @Get('online')
  async online() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return { total: 0 };
    const total = await this.sessions.usuariosOnline(tenantId);
    return { total };
  }

  @Post(':id/revogar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revogar(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new NotFoundException('Tenant nao identificado.');

    // Verifica que a sessao pertence ao tenant (RLS ja garante, mas checamos existencia)
    const sessao = await this.prisma.db.userSession.findFirst({
      where: { id, revogadoEm: null },
      select: { id: true, userId: true },
    });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada.');

    await this.sessions.revogar(id, user?.sub, tenantId);

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: user?.sub ?? null,
        acao: 'SESSAO_REVOGADA',
        entidade: 'user_sessions',
        entidadeId: id,
        dados: { userId: sessao.userId },
      },
    }).catch(() => undefined);
  }
}
