import { CanActivate, ExecutionContext, Injectable, Logger, Optional } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '../../common/tenant/tenant.context';
import { COOKIE_SESSION } from './govbr.config';
import { verifySession } from './session-token';
import { SessionsService } from '../sessions/sessions.service';

export interface AuthUser {
  id: string;
  sub: string;
  tenantId: string | null;
  role: string;
  nivel: number | null;
  mfa: boolean;
  jti?: string;
}

/**
 * Autenticação "soft" e GLOBAL: se houver um token de sessão válido (cookie
 * HttpOnly no web ou Bearer no app), popula `req.user` e enriquece o
 * TenantContext (userId/role). Se não houver, segue sem usuário — a
 * AUTORIZAÇÃO é feita depois pelo RolesGuard (@Roles) em cada rota protegida.
 *
 * Defesa em profundidade: um token emitido para o tenant A é rejeitado no
 * domínio do tenant B (cross-tenant). super_admin (tenantId null) é exceção.
 *
 * Sessões stateful (jti):
 *  - Se o token tem `jti`, verifica no Redis (SessionsService.estaAtiva).
 *  - false  → revogada/expirada → trata como anônimo (soft, não lança).
 *  - null   → Redis indisponível → FAIL-OPEN (segue autenticado, loga warn).
 *  - sem jti (token legado) → comportamento anterior (sem verificação Redis).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly log = new Logger(JwtAuthGuard.name);

  constructor(
    @Optional() private readonly sessions?: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extract(req);
    if (!token) return true;

    try {
      const claims = await verifySession(token);
      const ctxTenant = TenantContext.tenantId() ?? null;

      // token de outro tenant não vale neste domínio
      if (claims.role !== 'super_admin' && claims.tenantId !== ctxTenant) {
        return true; // ignora silenciosamente → segue como anônimo
      }

      // Verificação de revogação server-side (via jti no Redis)
      if (claims.jti && this.sessions) {
        const ativa = await this.sessions.estaAtiva(claims.jti);
        if (ativa === false) {
          // Sessão revogada ou expirada no Redis → trata como anônimo
          return true;
        }
        if (ativa === null) {
          // Redis indisponível → fail-open (loga warn, segue autenticado)
          this.log.warn(`JwtAuthGuard: Redis indisponível para jti=${claims.jti} — fail-open`);
        }
      }

      const user: AuthUser = {
        id: claims.sub,
        sub: claims.sub,
        tenantId: claims.tenantId,
        role: claims.role,
        nivel: claims.nivel ?? null,
        mfa: claims.mfa ?? false,
        jti: claims.jti,
      };
      (req as any).user = user;

      // enriquece o contexto da request (mesma referência usada pelo Prisma)
      const ctx = TenantContext.get();
      ctx.userId = claims.sub;
      ctx.role = claims.role;

      // Heartbeat fire-and-forget (atualiza presença online + ultima_atividade_em)
      if (claims.jti && this.sessions) {
        this.sessions
          .heartbeat(claims.jti, claims.sub, claims.tenantId)
          .catch(() => undefined);
      }
    } catch {
      // token inválido/expirado → anônimo
    }
    return true;
  }

  private extract(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    const cookies = (req as any).cookies as Record<string, string> | undefined;
    return cookies?.[COOKIE_SESSION];
  }
}
