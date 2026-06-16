import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { signSession } from '../auth/session-token';
import { COOKIE_SESSION } from '../auth/govbr.config';
import { verificarSenha } from '../auth/password';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { PlatformLoginDto } from './platform.dto';
import { SessionsService } from '../sessions/sessions.service';

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
 * Autenticação do super_admin no host de plataforma.
 * As rotas de login/logout são abertas (sem RolesGuard); /me exige a role.
 */
@Controller('_platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * POST /api/_platform/auth/login
   * Anti brute-force: 10 tentativas / 60s por IP.
   * Não retorna senhaHash nem qualquer dado sensível.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: PlatformLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const email = (body?.email ?? '').trim().toLowerCase();
    const senha = body?.senha ?? '';

    const user = await this.prisma.platform().user.findFirst({
      where: { email, role: 'super_admin', ativo: true },
      select: { id: true, senhaHash: true, nome: true },
    });

    if (!user || !verificarSenha(senha, user.senhaHash)) {
      // Auditamos tentativas falhas (tenantId null = contexto de plataforma)
      await this.prisma.platform().auditLog.create({
        data: {
          tenantId: null,
          atorId: user?.id ?? null,
          acao: 'PLATFORM_LOGIN_FALHA',
          entidade: 'user',
          entidadeId: null,
          dados: { email },
        },
      });
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const { token, jti, expiraEm } = await signSession({
      sub: user.id,
      tenantId: null,
      role: 'super_admin',
      nivel: null,
      mfa: false,
    });

    // Auditoria de login bem-sucedido
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: user.id,
        acao: 'PLATFORM_LOGIN',
        entidade: 'user',
        entidadeId: user.id,
        dados: {},
      },
    });

    // Registra sessao stateful para super_admin (tenantId = null → platform())
    this.sessions
      .registrar(jti, {
        userId: user.id,
        tenantId: null,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? undefined,
        expiraEm,
      })
      .catch(() => undefined);

    res.cookie(COOKIE_SESSION, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000, // 8h
    });
    res.json({ ok: true });
  }

  /**
   * GET /api/_platform/auth/me
   * Retorna dados básicos do super_admin autenticado. 401 se não autenticado.
   */
  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async me(@CurrentUser() authUser: AuthUser) {
    // authUser garantido pelo RolesGuard (403 se não autenticado)
    const user = await this.prisma.platform().user.findUnique({
      where: { id: authUser.id },
      select: { id: true, nome: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    // Nunca retorna senhaHash, cpfHash, mfaSecret
    return { id: user.id, nome: user.nome, email: user.email, role: user.role };
  }

  /**
   * POST /api/_platform/auth/logout
   * Limpa o cookie de sessão. Não requer autenticação (tolerante a tokens expirados).
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res() res: Response): void {
    res.clearCookie(COOKIE_SESSION, { path: '/' });
    res.status(HttpStatus.NO_CONTENT).end();
  }
}
