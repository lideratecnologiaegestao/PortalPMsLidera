import {
  Body,
  Controller,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { MfaService } from './mfa.service';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './jwt-auth.guard';
import { signSession } from './session-token';
import { COOKIE_SESSION } from './govbr.config';

const isProd = process.env.NODE_ENV === 'production';

/**
 * MFA (TOTP) self-service do usuário autenticado. `verify` ELEVA a sessão
 * (reemite o cookie com o claim `mfa: true`), exigido por endpoints sensíveis
 * via @RequireMfa.
 */
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  /** Gera o segredo + URL para o app autenticador (ainda não habilita). */
  @Post('setup')
  setup(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException();
    return this.mfa.setup(user.id);
  }

  /** Confirma o setup com um código e habilita o MFA. */
  @Post('habilitar')
  habilitar(@CurrentUser() user: AuthUser | undefined, @Body() body: { codigo: string }) {
    if (!user) throw new UnauthorizedException();
    return this.mfa.habilitar(user.id, body?.codigo ?? '');
  }

  /** Verifica o 2º fator e eleva a sessão (cookie com mfa: true). */
  @Post('verify')
  async verify(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: { codigo: string },
    @Res() res: Response,
  ): Promise<void> {
    if (!user) throw new UnauthorizedException();
    if (!(await this.mfa.verificar(user.id, body?.codigo ?? ''))) {
      throw new UnauthorizedException('Código MFA inválido.');
    }
    const { token } = await signSession({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      nivel: user.nivel,
      mfa: true,
      jti: user.jti, // preserva o jti existente para nao criar nova sessao no Redis
    });
    res.cookie(COOKIE_SESSION, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ mfa: true });
  }
}
