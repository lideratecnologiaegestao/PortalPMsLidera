import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { verificarVisitante, VisitorClaims } from './visitor-token.util';

/**
 * Guard para rotas de visitante anônimo do atendimento.
 * Lê o Bearer token, verifica com verificarVisitante e anexa os claims em
 * req.visitor. Também valida que o :id da rota corresponde ao conversaId do
 * token (evita que um visitante acesse conversa alheia).
 */
@Injectable()
export class VisitorGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de visitante ausente.');
    }
    const token = auth.slice(7);
    let claims: VisitorClaims;
    try {
      claims = await verificarVisitante(token);
    } catch {
      throw new UnauthorizedException('Token de visitante inválido ou expirado.');
    }

    // Valida que o :id da rota == conversaId do token (senão 403)
    const routeId = req.params?.id;
    if (routeId && routeId !== claims.conversaId) {
      throw new ForbiddenException('Token não autorizado para esta conversa.');
    }

    (req as any).visitor = claims;
    return true;
  }
}
