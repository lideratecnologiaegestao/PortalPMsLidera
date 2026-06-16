import { Body, Controller, Delete, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

/** Registro/remoção de device token de push do próprio usuário (App do Cidadão). */
@Controller('me/push-token')
@UseGuards(RolesGuard)
export class PushTokenController {
  constructor(private readonly push: PushService) {}

  @Post()
  registrar(@CurrentUser() user: AuthUser | undefined, @Body() body: { token: string; plataforma?: string }) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.push.registrar(user.sub, body.token, body.plataforma);
  }

  @Delete()
  remover(@Body() body: { token: string }) {
    return this.push.remover(body.token);
  }
}
