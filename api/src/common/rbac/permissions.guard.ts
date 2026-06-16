import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Guard de permissões granulares (camada 2 de RBAC).
 *
 * Deve ser usado APÓS RolesGuard — nunca o substitui.
 * Se não houver metadado @RequirePermissions no endpoint, passa direto.
 * Requer usuário autenticado (req.user populado pelo JwtAuthGuard).
 *
 * Fluxo:
 *   1. Lê @RequirePermissions na rota/classe (via Reflector).
 *   2. Se não declarado → libera (endpoint sem exigência granular).
 *   3. Se não há req.user → ForbiddenException.
 *   4. Chama PermissionsService.tem(); se false → ForbiddenException.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nenhuma permissão declarada → sem restrição granular
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub || !user?.role) {
      throw new ForbiddenException('Não autenticado.');
    }

    const permitido = await this.permissionsService.tem(user.sub, user.role, required);
    if (!permitido) {
      throw new ForbiddenException(
        `Permissão insuficiente: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
