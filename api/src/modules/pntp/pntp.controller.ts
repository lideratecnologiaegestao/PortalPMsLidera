import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PntpService } from './pntp.service';

/**
 * Painel de conformidade PNTP (uso administrativo). Mede o índice da prefeitura
 * em tempo real, lista o selo, os critérios essenciais pendentes (bloqueantes)
 * e o detalhamento por dimensão — base do dossiê de evidências.
 */
@Controller('pntp')
export class PntpController {
  constructor(private readonly pntp: PntpService) {}

  @Get('conformidade')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SUPER_ADMIN)
  conformidade() {
    return this.pntp.conformidade();
  }
}
