import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { GovbrOidcService } from './govbr-oidc.service';
import { AuthService } from './auth.service';
import { signTx, verifyTx } from './session-token';
import { COOKIE_SESSION, COOKIE_TX } from './govbr.config';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './jwt-auth.guard';
import { SessionsService } from '../sessions/sessions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

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

/** Cookies HttpOnly: o token NUNCA fica acessível ao JS do navegador (anti-XSS). */
function cookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd, // atrás do Cloudflare TLS em produção
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/** Evita open redirect: resolve como caminho relativo e descarta qualquer host. */
function safeRedirect(redirect?: string): string {
  if (!redirect) return '/';
  try {
    // base sentinela: se o resultado mudar de host, era um redirect absoluto
    const u = new URL(redirect, 'http://internal.invalid');
    if (u.host !== 'internal.invalid') return '/';
    const path = u.pathname + u.search;
    return path.startsWith('/') && !path.startsWith('//') ? path : '/';
  } catch {
    return '/';
  }
}

/** Mensagens fixas para erros OAuth do gov.br (não refletir input do callback). */
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Login cancelado pelo cidadão.',
  invalid_request: 'Requisição de login inválida.',
  server_error: 'O gov.br está indisponível no momento.',
  temporarily_unavailable: 'O gov.br está temporariamente indisponível.',
};

// fluxo OIDC é sensível (CSRF/brute-force de code) → limite mais apertado.
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('auth/govbr')
export class AuthController {
  constructor(
    private readonly oidc: GovbrOidcService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Inicia o fluxo: redireciona para o gov.br guardando a transação num cookie. */
  @Get('login')
  async login(
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ): Promise<void> {
    const { url, tx } = this.oidc.buildAuthorization(safeRedirect(redirect));
    const txCookie = await signTx(tx);
    res.cookie(COOKIE_TX, txCookie, cookieOpts(10 * 60 * 1000));
    res.redirect(url);
  }

  /** Callback do gov.br: valida, faz upsert do cidadão e emite a sessão. */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      throw new UnauthorizedException(
        OAUTH_ERRORS[error] ?? 'Falha na autenticação gov.br.',
      );
    }

    const txRaw = (req as any).cookies?.[COOKIE_TX];
    if (!txRaw) throw new UnauthorizedException('Transação de login expirada.');
    const tx = await verifyTx(txRaw);

    if (!code || state !== tx.state) {
      throw new UnauthorizedException('State inválido (possível CSRF).');
    }

    const tokens = await this.oidc.exchangeCode(code, tx.codeVerifier);
    const idPayload = await this.oidc.validateIdToken(tokens.id_token, tx.nonce);
    const identity = await this.oidc.fetchIdentity(tokens.access_token, idPayload);

    const session = await this.auth.loginCidadao(identity, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    res.clearCookie(COOKIE_TX, { path: '/' });
    res.cookie(COOKIE_SESSION, session, cookieOpts(8 * 60 * 60 * 1000));
    res.redirect(safeRedirect(tx.redirect));
  }

  /** Dados do usuário autenticado (ou 401). */
  @Get('me')
  me(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return user;
  }

  /** Encerra a sessão (limpa o cookie + revoga sessão no Redis/banco). */
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser | undefined, @Res() res: Response): Promise<void> {
    if (user?.jti) {
      // Revoga a sessao server-side (best-effort)
      this.sessions.revogar(user.jti, user.sub, user.tenantId).catch(() => undefined);

      // Auditoria de logout
      const tenantId = TenantContext.tenantId() ?? null;
      if (tenantId) {
        this.prisma.db.auditLog
          .create({
            data: {
              tenantId,
              atorId: user.sub,
              acao: 'LOGOUT',
              entidade: 'user',
              entidadeId: user.sub,
              dados: {},
            },
          })
          .catch(() => undefined);
      } else {
        this.prisma.platform().auditLog
          .create({
            data: {
              tenantId: null,
              atorId: user.sub,
              acao: 'LOGOUT',
              entidade: 'user',
              entidadeId: user.sub,
              dados: {},
            },
          })
          .catch(() => undefined);
      }
    }
    res.clearCookie(COOKIE_SESSION, { path: '/' });
    res.status(204).end();
  }
}
