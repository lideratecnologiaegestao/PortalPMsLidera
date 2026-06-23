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
import { ElevationRequestsService } from './elevation-requests.service';
import { RecusarElevacaoDto } from './elevation-requests.dto';

/**
 * Gerenciador da Plataforma: aprovação de solicitações sensíveis (ouvidor,
 * assistente_ouvidoria, ti) cross-tenant.
 *
 * ADR-0005: somente super_admin. Usa prisma.platform() no service —
 * justificativa: esses papéis requerem aprovação centralizada da Lidera
 * para garantir responsabilidade sobre acesso a dados sensíveis de ouvidoria.
 */
@Controller('_platform/elevation-requests')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class ElevationRequestsPlatformController {
  constructor(private readonly service: ElevationRequestsService) {}

  /**
   * GET /api/_platform/elevation-requests?status=pendente
   * Lista CROSS-TENANT somente papéis ouvidor/assistente_ouvidoria/ti.
   */
  @Get()
  listar(@Query('status') status?: string) {
    return this.service.listarParaSuperAdmin(status);
  }

  /**
   * POST /api/_platform/elevation-requests/:id/aprovar
   * Aprova elevação para ouvidor/assistente_ouvidoria/ti.
   * 403 se papel for gestor/servidor (deve ser tratado pelo admin_prefeitura).
   */
  @Post(':id/aprovar')
  @HttpCode(HttpStatus.OK)
  aprovar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.aprovarSuperAdmin(id, user.id);
  }

  /**
   * POST /api/_platform/elevation-requests/:id/recusar
   * Recusa com motivo.
   */
  @Post(':id/recusar')
  @HttpCode(HttpStatus.OK)
  recusar(
    @Param('id') id: string,
    @Body() dto: RecusarElevacaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recusarSuperAdmin(id, user.id, dto.motivo);
  }
}
