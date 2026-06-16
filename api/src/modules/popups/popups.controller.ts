import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PublicCacheInterceptor } from '../../common/http/public-cache.interceptor';
import { PopupDto, PopupsService } from './popups.service';

/** Popups públicos (filtrados por página/datas/ativo). */
@Controller('popups')
@UseInterceptors(PublicCacheInterceptor)
export class PopupsController {
  constructor(private readonly service: PopupsService) {}

  @Get()
  listar(@Query('pagina') pagina?: string) {
    return this.service.listarPublicos(pagina);
  }
}

/** Gestão admin de popups. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/popups')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class PopupsAdminController {
  constructor(private readonly service: PopupsService) {}

  @Get()
  listarAdmin() {
    return this.service.listarAdmin();
  }

  @Post()
  criar(@Body() dto: PopupDto) {
    return this.service.criar(dto);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() dto: PopupDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
