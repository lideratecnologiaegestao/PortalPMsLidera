import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { EscopoSecretariaService } from '../../common/escopo/escopo-secretaria.service';
import { CriarGaleriaDto, AtualizarGaleriaDto } from './galeria.dto';
import { GaleriaService } from './galeria.service';

/** Leitura pública da galeria compartilhada do tenant. */
@Controller('galeria')
export class GaleriaController {
  constructor(private readonly service: GaleriaService) {}

  /**
   * GET /api/galeria?tipo=foto|video&page=1&pageSize=24
   *
   * Sem page/pageSize → retorna array (retrocompat portal web).
   * Com page/pageSize → retorna { items, total, page, pageSize } (app mobile).
   */
  @Get()
  listar(
    @Query('tipo') tipo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = page !== undefined ? Math.max(1, Number(page)) : undefined;
    const ps = pageSize !== undefined ? Math.min(100, Math.max(1, Number(pageSize))) : undefined;
    return this.service.listarPublica(tipo, p, ps);
  }
}

/**
 * Gestão admin da galeria.
 * RBAC: GESTOR e ADMIN_PREFEITURA passam pelo papel.
 * SERVIDOR passa se um grupo conceder 'galeria.gerenciar'.
 * ADR-0005 Fase 4: gestor/servidor só veem/editam itens da SUA secretaria.
 */
@Controller('admin/galeria')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR)
@RequirePermissions('galeria.gerenciar')
export class GaleriaAdminController {
  constructor(
    private readonly service: GaleriaService,
    private readonly escopoSvc: EscopoSecretariaService,
  ) {}

  @Get()
  async listarAdmin(
    @Query('tipo') tipo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.listarAdmin({
      tipo,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 24))),
      escopoSecretariaId: escopo,
    });
  }

  @Post()
  async criar(@Body() dto: CriarGaleriaDto, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.criar(dto, escopo);
  }

  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarGaleriaDto,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.atualizar(id, dto, escopo);
  }

  @Delete(':id')
  async excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.excluir(id, escopo);
  }
}
