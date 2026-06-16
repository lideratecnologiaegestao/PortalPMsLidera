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
import { CriarGaleriaDto, AtualizarGaleriaDto } from './galeria.dto';
import { GaleriaService } from './galeria.service';

/** Leitura pública da galeria compartilhada do tenant. */
@Controller('galeria')
export class GaleriaController {
  constructor(private readonly service: GaleriaService) {}

  /** GET /api/galeria?tipo=foto|video */
  @Get()
  listar(@Query('tipo') tipo?: string) {
    return this.service.listarPublica(tipo);
  }
}

/**
 * Gestão admin da galeria.
 * RBAC: GESTOR e ADMIN_PREFEITURA passam pelo papel.
 * SERVIDOR passa se um grupo conceder 'galeria.gerenciar'.
 */
@Controller('admin/galeria')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR)
@RequirePermissions('galeria.gerenciar')
export class GaleriaAdminController {
  constructor(private readonly service: GaleriaService) {}

  @Get()
  listarAdmin(
    @Query('tipo') tipo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarAdmin({
      tipo,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 24))),
    });
  }

  @Post()
  criar(@Body() dto: CriarGaleriaDto) {
    return this.service.criar(dto);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarGaleriaDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
