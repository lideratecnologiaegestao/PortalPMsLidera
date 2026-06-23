import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ElevationRequestsService } from './elevation-requests.service';
import { RecusarElevacaoDto } from './elevation-requests.dto';

/**
 * Painel admin da entidade: aprovação de solicitações de gestor/servidor.
 *
 * ADR-0005: admin_prefeitura e gestor veem/aprovam SOMENTE papéis
 * gestor e servidor. Papéis sensíveis (ouvidor/assistente_ouvidoria/ti)
 * são rejeitados com 403 pelo service.
 *
 * RLS garante que o tenant só vê as próprias solicitações.
 */
@Controller('admin/elevation-requests')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
export class ElevationRequestsAdminController {
  constructor(private readonly service: ElevationRequestsService) {}

  /**
   * GET /api/admin/elevation-requests?status=pendente
   * Lista solicitações do tenant com papel_solicitado ∈ {gestor, servidor}.
   * Query `status` padrão: 'pendente'.
   */
  @Get()
  listar(
    @Query('status') status?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    return this.service.listarParaAdmin(tenantId, status);
  }

  /**
   * POST /api/admin/elevation-requests/:id/aprovar
   * Aprova. Em transação: seta users.role + users.secretaria_id + request → 'aprovada'.
   * 403 se o papel for ouvidor/assistente_ouvidoria/ti (precisa de super_admin).
   */
  @Post(':id/aprovar')
  @HttpCode(HttpStatus.OK)
  aprovar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const tenantId = TenantContext.tenantId()!;
    return this.service.aprovarAdmin(id, user.id, tenantId);
  }

  /**
   * POST /api/admin/elevation-requests/:id/recusar
   * Recusa com motivo.
   */
  @Post(':id/recusar')
  @HttpCode(HttpStatus.OK)
  recusar(
    @Param('id') id: string,
    @Body() dto: RecusarElevacaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    const tenantId = TenantContext.tenantId()!;
    return this.service.recusarAdmin(id, user.id, tenantId, dto.motivo);
  }
}
