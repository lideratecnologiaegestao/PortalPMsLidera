import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './jwt-auth.guard';

/** Injeta o usuário autenticado no handler. Ex.: foo(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest().user,
);
