import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { HinosEstaduaisService } from './hinos-estaduais.service';
import { AtualizarHinoEstadualDto } from './hinos-estaduais.dto';

/**
 * Editor da base de hinos estaduais (usados nas páginas finais do Diário).
 * Base GLOBAL compartilhada — restrito a admin da entidade / super admin.
 */
@Controller('admin/hinos-estaduais')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class HinosEstaduaisController {
  constructor(private readonly service: HinosEstaduaisService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Put(':uf')
  atualizar(@Param('uf') uf: string, @Body() dto: AtualizarHinoEstadualDto) {
    return this.service.atualizar(uf, dto);
  }
}
