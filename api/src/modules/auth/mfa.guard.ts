import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const MFA_KEY = 'require_mfa';

/** Exige que a sessão tenha passado pelo 2º fator (MFA). */
export const RequireMfa = () => SetMetadata(MFA_KEY, true);

/**
 * Bloqueia o endpoint se a sessão não tiver o claim `mfa` (segundo fator
 * verificado via POST /auth/mfa/verify). Use em atos sensíveis.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exige = this.reflector.getAllAndOverride<boolean>(MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!exige) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user?.mfa) {
      throw new ForbiddenException('Esta ação exige verificação por MFA.');
    }
    return true;
  }
}
