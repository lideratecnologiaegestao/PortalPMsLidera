import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { SessionsService } from './sessions.service';

/**
 * Endpoints do proprio usuario para ver e revogar suas proprias sessoes.
 * Qualquer usuario autenticado pode usar.
 *
 * GET  /api/auth/minhas-sessoes          — lista sessoes ativas do usuario
 * POST /api/auth/minhas-sessoes/:id/revogar — revoga uma sessao propria
 */
@Controller('auth/minhas-sessoes')
@UseGuards(RolesGuard)
export class MinhasSesoesController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  async listar(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Nao autenticado.');
    return this.sessions.minhasSessoes(user.sub, user.tenantId);
  }

  @Post(':id/revogar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revogar(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Nao autenticado.');
    await this.sessions.revogarMinha(id, user.sub, user.tenantId);
  }
}
