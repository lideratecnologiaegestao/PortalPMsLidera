import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { ContatosService } from './contatos.service';

/**
 * Contatos e preferências de notificação do próprio usuário (cidadão logado ou
 * interno). Qualquer usuário autenticado; o userId vem do token (sub).
 */
@Controller('me/contatos')
@UseGuards(RolesGuard)
export class ContatosController {
  constructor(private readonly contatos: ContatosService) {}

  @Get()
  obter(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.contatos.obter(user.sub);
  }

  @Put()
  salvar(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: { whatsapp?: string; email?: string; notifWhatsapp?: boolean; notifEmail?: boolean },
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.contatos.salvar(user.sub, dto);
  }

  @Post('verificar')
  verificar(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: { canal: 'whatsapp' | 'email'; codigo: string },
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.contatos.verificar(user.sub, body.canal, body.codigo);
  }

  @Post('reenviar')
  reenviar(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: { canal: 'whatsapp' | 'email' },
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.contatos.reenviar(user.sub, body.canal);
  }
}
