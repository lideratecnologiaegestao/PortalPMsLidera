import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { SalvarHistoriaDto } from './historia.dto';
import { HistoriaService } from './historia.service';

/** Leitura pública da história do município. */
@Controller('historia-municipio')
export class HistoriaController {
  constructor(private readonly service: HistoriaService) {}

  @Get()
  obter() {
    return this.service.obterPublico();
  }
}

/** Gestão admin. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/historia-municipio')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class HistoriaAdminController {
  constructor(private readonly service: HistoriaService) {}

  @Get()
  obter() {
    return this.service.obterAdmin();
  }

  @Put()
  salvar(@Body() dto: SalvarHistoriaDto, @CurrentUser() user?: AuthUser) {
    return this.service.salvar(dto, user?.sub);
  }
}
