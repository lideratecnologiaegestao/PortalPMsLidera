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
import { CriarBannerDto, AtualizarBannerDto } from './banners.dto';
import { BannersService } from './banners.service';

/** Leitura pública de banners ativos (carrossel/hero da home). */
@Controller('banners')
export class BannersController {
  constructor(private readonly service: BannersService) {}

  @Get()
  listarAtivos() {
    return this.service.listarAtivos();
  }
}

/**
 * Gestão admin de banners.
 * RBAC: GESTOR e ADMIN_PREFEITURA passam pelo papel.
 * SERVIDOR passa se um grupo conceder 'banners.gerenciar'.
 */
@Controller('admin/banners')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR)
@RequirePermissions('banners.gerenciar')
export class BannersAdminController {
  constructor(private readonly service: BannersService) {}

  @Get()
  listarAdmin(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarAdmin({
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  criar(@Body() dto: CriarBannerDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarBannerDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
