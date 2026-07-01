import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarPrefeitoDto, AtualizarPrefeitoDto } from './prefeito.dto';
import { PrefeitoService } from './prefeito.service';

/** Leitura pública: titular + vice + galeria de ex-prefeitos. */
@Controller('prefeitos')
export class PrefeitoController {
  constructor(private readonly service: PrefeitoService) {}

  @Get()
  listar() {
    return this.service.listarPublico();
  }
}

/** Gestão admin. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/prefeitos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class PrefeitoAdminController {
  constructor(private readonly service: PrefeitoService) {}

  @Get()
  listar() {
    return this.service.listarAdmin();
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  criar(@Body() dto: CriarPrefeitoDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarPrefeitoDto, @CurrentUser() user?: AuthUser) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
