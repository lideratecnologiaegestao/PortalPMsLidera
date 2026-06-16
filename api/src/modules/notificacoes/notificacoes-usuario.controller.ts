import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { NotificacoesUsuarioService } from './notificacoes-usuario.service';

/**
 * Central de notificações do próprio usuário (cidadão ou interno). Qualquer
 * usuário autenticado; o userId vem do token (sub).
 */
@Controller('me/notificacoes')
@UseGuards(RolesGuard)
export class NotificacoesUsuarioController {
  constructor(private readonly notif: NotificacoesUsuarioService) {}

  @Get()
  listar(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.notif.listar(user.sub);
  }

  @Get('nao-lidas')
  naoLidas(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.notif.naoLidas(user.sub);
  }

  @Post('ler')
  ler(@CurrentUser() user: AuthUser | undefined, @Body() body: { id?: string }) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.notif.marcarLidas(user.sub, body?.id);
  }
}
