import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { DashboardService } from './dashboard.service';
import { UpsertNotaDto } from './dashboard.dto';

const ROLES_ADMIN = [
  Role.SERVIDOR,
  Role.GESTOR,
  Role.ADMIN_PREFEITURA,
  Role.SUPER_ADMIN,
  Role.OUVIDOR,
  Role.ASSISTENTE_OUVIDORIA,
  Role.TI,
] as const;

/**
 * Painel BI administrativo.
 *
 * GET  /api/admin/dashboard       — agregado geral de BI (todos os KPIs)
 * GET  /api/admin/dashboard/nota  — lê nota pessoal do usuário logado
 * PUT  /api/admin/dashboard/nota  — salva/atualiza nota pessoal
 */
@Controller('admin/dashboard')
@UseGuards(RolesGuard)
@Roles(...ROLES_ADMIN)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /** Agregado de BI: KPIs, tendência, distribuições, alertas. */
  @Get()
  obterAgregado() {
    return this.service.obterAgregado();
  }

  /** Lê a nota pessoal (sticky note) do usuário autenticado. */
  @Get('nota')
  async obterNota(@CurrentUser() user?: AuthUser) {
    if (!user?.sub) throw new ForbiddenException('Usuário não autenticado.');
    return this.service.obterNota(user.sub);
  }

  /** Cria ou atualiza a nota pessoal (sticky note) do usuário autenticado. */
  @Put('nota')
  async upsertNota(@Body() dto: UpsertNotaDto, @CurrentUser() user?: AuthUser) {
    if (!user?.sub) throw new ForbiddenException('Usuário não autenticado.');
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new ForbiddenException('Tenant não resolvido.');
    return this.service.upsertNota(tenantId, user.sub, dto.conteudo);
  }
}
