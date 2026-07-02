import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { DiarioConfigService } from './diario-config.service';
import { AtualizarDiarioConfigDto } from './diario-config.dto';

/** Configuração de layout do PDF do Diário Oficial (colunas, cabeçalho, rodapé, hinos). */
@Controller('admin/diario/config')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class DiarioConfigController {
  constructor(private readonly service: DiarioConfigService) {}

  @Get()
  obter() {
    return this.service.obter();
  }

  @Patch()
  atualizar(@Body() dto: AtualizarDiarioConfigDto) {
    return this.service.atualizar(dto);
  }
}
