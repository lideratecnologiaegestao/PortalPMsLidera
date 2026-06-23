import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { EulaService } from './eula.service';
import { SkipEula } from './skip-eula.decorator';

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
 * Endpoints de EULA / Termo de Sigilo da Ouvidoria (ADR-0005 Fase 3).
 *
 * GET  /api/auth/eula         — retorna conteúdo do EULA + flag jaAceito
 * POST /api/auth/eula/aceitar — registra aceite do usuário autenticado
 *
 * Estas rotas são explicitamente isentas do EulaGuard (@SkipEula) para
 * não criar uma dependência circular (o usuário precisa acessar o EULA
 * para poder aceitar, antes de poder acessar os outros recursos).
 */
@Controller('auth/eula')
@UseGuards(RolesGuard)
@SkipEula()
export class EulaController {
  constructor(private readonly eulaService: EulaService) {}

  /** Retorna o EULA vigente e se o usuário já aceitou. */
  @Get()
  async obter(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.eulaService.obter(user.sub);
  }

  /**
   * Registra o aceite do EULA pelo usuário autenticado.
   * Idempotente: chamar novamente com a mesma versão é um no-op.
   */
  @Post('aceitar')
  async aceitar(@CurrentUser() user: AuthUser | undefined, @Req() req: Request) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    await this.eulaService.aceitar(user.sub, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    return { ok: true };
  }
}
