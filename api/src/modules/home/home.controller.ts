import {
  Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PublicCacheInterceptor } from '../../common/http/public-cache.interceptor';
import { AtalhoDto, ConfigHomeDto, HomeService } from './home.service';

/** Leitura pública do layout/atalhos da home. */
@Controller('home')
@UseInterceptors(PublicCacheInterceptor)
export class HomeController {
  constructor(private readonly service: HomeService) {}

  @Get()
  publico() {
    return this.service.getPublico();
  }
}

/** Gestão admin do layout da home. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/home')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class HomeAdminController {
  constructor(private readonly service: HomeService) {}

  @Get('config')
  getConfig() {
    return this.service.getConfigAdmin();
  }

  @Put('config')
  salvarConfig(@Body() dto: ConfigHomeDto) {
    return this.service.salvarConfig(dto);
  }

  @Get('atalhos')
  listar() {
    return this.service.listarAtalhos();
  }

  @Post('atalhos')
  criar(@Body() dto: AtalhoDto) {
    return this.service.criarAtalho(dto);
  }

  @Put('atalhos/:id')
  atualizar(@Param('id') id: string, @Body() dto: AtalhoDto) {
    return this.service.atualizarAtalho(id, dto);
  }

  @Delete('atalhos/:id')
  excluir(@Param('id') id: string) {
    return this.service.excluirAtalho(id);
  }
}
