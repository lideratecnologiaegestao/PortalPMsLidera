import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_EULA_KEY } from './skip-eula.decorator';
import { EulaService } from './eula.service';
import { EULA_ROLES_OBRIGADOS } from './eula.constants';

/**
 * EulaGuard — defesa em profundidade (ADR-0005 Fase 3).
 *
 * Para usuários com role ∈ {ouvidor, assistente_ouvidoria}, bloqueia com 403
 * (code: EULA_REQUIRED) se não houver aceite da versão vigente do EULA.
 *
 * Não afeta:
 *  - Rotas marcadas com @SkipEula() (ex.: GET/POST /api/auth/eula, login).
 *  - super_admin / admin_prefeitura / outros roles (não acessam ouvidoria).
 *  - Usuários sem role definido (já barrados pelo JwtAuthGuard/RolesGuard).
 */
@Injectable()
export class EulaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly eula: EulaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Rota marcada como isenta do check
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_EULA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { sub?: string; role?: string } | undefined;

    if (!user?.sub || !user?.role) return true; // não autenticado — deixa o RolesGuard tratar

    const role = user.role as string;
    if (!(EULA_ROLES_OBRIGADOS as readonly string[]).includes(role)) return true;

    const precisaAceitar = await this.eula.eulaRequired(user.sub, role);
    if (precisaAceitar) {
      throw new ForbiddenException({
        code: 'EULA_REQUIRED',
        message: 'Você precisa aceitar o Termo de Sigilo antes de acessar este recurso.',
      });
    }
    return true;
  }
}
