import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { SalvarHinoBrasaoDto } from './hino-brasao.dto';
import { HinoBrasaoService } from './hino-brasao.service';

/** Leitura pública do hino e brasão do município. */
@Controller('hino-brasao')
export class HinoBrasaoController {
  constructor(private readonly service: HinoBrasaoService) {}

  @Get()
  obter() {
    return this.service.obterPublico();
  }
}

/** Gestão admin. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/hino-brasao')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class HinoBrasaoAdminController {
  constructor(private readonly service: HinoBrasaoService) {}

  @Get()
  obter() {
    return this.service.obterAdmin();
  }

  @Put()
  salvar(@Body() dto: SalvarHinoBrasaoDto, @CurrentUser() user?: AuthUser) {
    return this.service.salvar(dto, user?.sub);
  }
}
