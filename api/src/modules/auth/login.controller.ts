import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { COOKIE_SESSION } from './govbr.config';
import { TurnstileService } from '../turnstile/turnstile.service';

const isProd = process.env.NODE_ENV === 'production';

/** Extrai o IP real do cliente respeitando proxies (X-Forwarded-For). */
function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip ?? undefined;
}

/**
 * Login local (e-mail + senha) para servidores/admin — alternativa ao gov.br.
 * Emite o cookie de sessão HttpOnly. Se `mfaRequired`, o cliente deve chamar
 * /auth/mfa/verify para elevar a sessão antes de atos sensíveis.
 *
 * Turnstile: o campo `turnstileToken` é opcional no body; se o Turnstile estiver
 * desabilitado (env vazio), a verificação retorna true e o fluxo não é bloqueado.
 */
@Controller('auth')
export class LoginController {
  constructor(
    private readonly auth: AuthService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti brute-force
  @Post('login')
  async login(
    @Body() body: { email: string; senha: string; turnstileToken?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = clientIp(req);

    // Verifica o Turnstile antes de qualquer consulta ao banco
    const turnstileOk = await this.turnstile.verificar(body?.turnstileToken, ip);
    if (!turnstileOk) {
      throw new BadRequestException(
        'Verificação de segurança falhou. Recarregue a página e tente novamente.',
      );
    }

    const { token, mfaRequired, senhaExpirada, eulaRequired } = await this.auth.loginLocal(
      body?.email ?? '',
      body?.senha ?? '',
      { ip, userAgent: req.headers['user-agent'] ?? undefined },
    );
    res.cookie(COOKIE_SESSION, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ ok: true, mfaRequired, senhaExpirada, eulaRequired });
  }
}
