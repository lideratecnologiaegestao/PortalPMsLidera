import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { SalvarPoliticaDto } from './politicas.dto';
import { PoliticasService } from './politicas.service';

/** Leitura pública de um documento legal (acessibilidade | privacidade | cookies). */
@Controller('politicas')
export class PoliticasController {
  constructor(private readonly service: PoliticasService) {}

  @Get(':tipo')
  obter(@Param('tipo') tipo: string) {
    return this.service.obterPublico(tipo);
  }
}

/** Gestão admin (versionada). RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/politicas')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class PoliticasAdminController {
  constructor(private readonly service: PoliticasService) {}

  @Get(':tipo/versoes')
  versoes(@Param('tipo') tipo: string) {
    return this.service.listarVersoes(tipo);
  }

  @Get(':tipo/versoes/:id')
  versao(@Param('id') id: string) {
    return this.service.obterVersao(id);
  }

  @Post(':tipo/versoes/:id/restaurar')
  restaurar(@Param('tipo') tipo: string, @Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.restaurar(tipo, id, user?.sub);
  }

  @Get(':tipo')
  obter(@Param('tipo') tipo: string) {
    return this.service.obterAdmin(tipo);
  }

  @Put(':tipo')
  salvar(@Param('tipo') tipo: string, @Body() dto: SalvarPoliticaDto, @CurrentUser() user?: AuthUser) {
    return this.service.salvar(tipo, dto, user?.sub);
  }
}
