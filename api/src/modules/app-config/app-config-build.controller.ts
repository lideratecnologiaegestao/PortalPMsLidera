import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { AppConfigBuildService } from './app-config-build.service';
import { SolicitarBuildDto } from './app-config-build.dto';

/**
 * Controller de builds EAS do App do Cidadão (ADR-0006 Fase 2).
 *
 * Acesso: ADMIN_PREFEITURA | SUPER_ADMIN.
 *
 * Endpoints:
 *  POST   /api/admin/app-config/builds          → solicitar build
 *  GET    /api/admin/app-config/builds           → listar builds (mais recentes)
 *  GET    /api/admin/app-config/builds/:id       → obter build (polling do painel)
 */
@Controller('admin/app-config/builds')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class AppConfigBuildController {
  constructor(private readonly buildService: AppConfigBuildService) {}

  /**
   * POST /api/admin/app-config/builds
   * Valida pré-requisitos e enfileira um novo build EAS.
   * Body: { perfil: 'preview' | 'production' }
   */
  @Post()
  async solicitar(
    @Body() dto: SolicitarBuildDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.buildService.solicitar(dto.perfil, user.id);
  }

  /**
   * GET /api/admin/app-config/builds?limit=20
   * Lista os builds do tenant atual, do mais recente ao mais antigo.
   */
  @Get()
  async listar(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.buildService.listar(limit ?? 20);
  }

  /**
   * GET /api/admin/app-config/builds/:id
   * Retorna um build específico. 404 se não pertencer ao tenant.
   * Usado pelo painel para polling do status.
   */
  @Get(':id')
  async obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.buildService.obter(id);
  }
}
