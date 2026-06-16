import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantEmailConfigService } from './tenant-email-config.service';

/**
 * Configuração de e-mail (SMTP/IMAP) no painel da prefeitura. Individual por
 * tenant — cada município usa seu domínio/caixa. RBAC: admin da prefeitura.
 */
@Controller('admin/config/email')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class TenantEmailConfigController {
  constructor(private readonly service: TenantEmailConfigService) {}

  @Get()
  obter() {
    return this.service.obter();
  }

  @Put()
  salvar(@Body() dto: Record<string, unknown>) {
    return this.service.salvar(dto);
  }

  @Post('testar')
  testar(@Body() body: { destino?: string }) {
    return this.service.testar(body?.destino);
  }
}
