import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CidadaoAuthService } from './cidadao-auth.service';
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
 * Cadastro/login do CIDADÃO sem gov.br (e-mail + senha + verificação por e-mail
 * e WhatsApp). Endpoints públicos, com rate limit (anti-abuso). O login emite o
 * cookie de sessão (web) E devolve o token no corpo (app mobile → Bearer).
 *
 * Turnstile: os campos `turnstileToken` nos bodies de cadastro/registrar/login são
 * opcionais. Quando TURNSTILE_SECRET_KEY e TURNSTILE_SITE_KEY não estão configurados,
 * a verificação retorna true e nenhum fluxo é bloqueado (degradação graciosa).
 */
@Controller('auth/cidadao')
export class CidadaoAuthController {
  constructor(
    private readonly cidadao: CidadaoAuthService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('cadastro')
  async cadastro(
    @Body() dto: { nome: string; email: string; telefone?: string; senha: string; turnstileToken?: string },
    @Req() req: Request,
  ) {
    const ip = clientIp(req);
    const ok = await this.turnstile.verificar(dto?.turnstileToken, ip);
    if (!ok) {
      throw new BadRequestException(
        'Verificação de segurança falhou. Recarregue a página e tente novamente.',
      );
    }
    return this.cidadao.cadastrar(dto);
  }

  /**
   * POST /api/auth/cidadao/registrar — alias público para ADR-0005 Fase 2.
   * Aceita {nome, email, senha} e cria o usuário com role='cidadao'.
   * Equivale a POST /api/auth/cidadao/cadastro (reusa a mesma lógica).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('registrar')
  async registrar(
    @Body() dto: { nome: string; email: string; senha: string; turnstileToken?: string },
    @Req() req: Request,
  ) {
    const ip = clientIp(req);
    const ok = await this.turnstile.verificar(dto?.turnstileToken, ip);
    if (!ok) {
      throw new BadRequestException(
        'Verificação de segurança falhou. Recarregue a página e tente novamente.',
      );
    }
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
    @Body() b: { email: string; senha: string; turnstileToken?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = clientIp(req);

    const ok = await this.turnstile.verificar(b?.turnstileToken, ip);
    if (!ok) {
      throw new BadRequestException(
        'Verificação de segurança falhou. Recarregue a página e tente novamente.',
      );
    }

    const { token, user } = await this.cidadao.login(
      b?.email ?? '',
      b?.senha ?? '',
      { ip, userAgent: req.headers['user-agent'] ?? undefined },
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
