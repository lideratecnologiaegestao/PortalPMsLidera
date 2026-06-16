import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CidadaoAuthService } from './cidadao-auth.service';
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
 * Cadastro/login do CIDADÃO sem gov.br (e-mail + senha + verificação por e-mail
 * e WhatsApp). Endpoints públicos, com rate limit (anti-abuso). O login emite o
 * cookie de sessão (web) E devolve o token no corpo (app mobile → Bearer).
 */
@Controller('auth/cidadao')
export class CidadaoAuthController {
  constructor(private readonly cidadao: CidadaoAuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('cadastro')
  cadastro(@Body() dto: { nome: string; email: string; telefone?: string; senha: string }) {
    return this.cidadao.cadastrar(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verificar')
  verificar(@Body() b: { email: string; finalidade: 'email' | 'telefone'; codigo: string }) {
    return this.cidadao.verificar(b.email, b.finalidade, b.codigo);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reenviar')
  reenviar(@Body() b: { email: string; finalidade: 'email' | 'telefone' }) {
    return this.cidadao.reenviar(b.email, b.finalidade);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() b: { email: string; senha: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { token, user } = await this.cidadao.login(
      b?.email ?? '',
      b?.senha ?? '',
      { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? undefined },
    );
    res.cookie(COOKIE_SESSION, token, {
      httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000,
    });
    // token no corpo p/ o app (Bearer); o web pode usar o cookie HttpOnly.
    res.json({ ok: true, token, user });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('recuperar')
  recuperar(@Body() b: { email: string }) {
    return this.cidadao.recuperar(b?.email ?? '');
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('redefinir')
  redefinir(@Body() b: { email: string; codigo: string; novaSenha: string }) {
    return this.cidadao.redefinir(b?.email ?? '', b?.codigo ?? '', b?.novaSenha ?? '');
  }
}
