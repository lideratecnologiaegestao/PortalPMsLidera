import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './roles.enum';

/**
 * Valida a role do usuário (vinda do JWT, injetada em req.user por um AuthGuard
 * anterior — gov.br ou e-mail/senha). super_admin sempre passa.
 *
 * Importante: o RolesGuard é a 1ª camada (o que você PODE fazer). O isolamento
 * de DADOS é garantido pelo RLS no banco (o que você PODE VER). As duas camadas
 * são independentes e ambas obrigatórias.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) throw new ForbiddenException('Não autenticado.');
    if (user.role === Role.SUPER_ADMIN) return true;

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Você não tem permissão para esta ação.');
    }
    return true;
  }
}
