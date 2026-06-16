import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { COOKIE_SESSION } from './govbr.config';

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
 */
@Controller('auth')
export class LoginController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti brute-force
  @Post('login')
  async login(
    @Body() body: { email: string; senha: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { token, mfaRequired, senhaExpirada } = await this.auth.loginLocal(
      body?.email ?? '',
      body?.senha ?? '',
      { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? undefined },
    );
    res.cookie(COOKIE_SESSION, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ ok: true, mfaRequired, senhaExpirada });
  }
}
