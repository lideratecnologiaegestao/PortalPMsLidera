import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Selo de confiabilidade gov.br. Algumas ações exigem nível mínimo (ex.:
 * protocolar recurso ESIC, assinar documentos) — gateie por confiabilidade,
 * não só por login. Ver skill govbr-login-unico e docs/04-seguranca.md.
 */
export const Nivel = { BRONZE: 1, PRATA: 2, OURO: 3 } as const;

export const CONFIABILIDADE_KEY = 'min_confiabilidade';

/** Exige confiabilidade gov.br mínima no endpoint. Ex.: @MinConfiabilidade(Nivel.PRATA) */
export const MinConfiabilidade = (min: number) =>
  SetMetadata(CONFIABILIDADE_KEY, min);

/** Função pura testável: o usuário atende o nível mínimo exigido? */
export function atendeNivel(
  userNivel: number | null | undefined,
  min: number,
): boolean {
  return typeof userNivel === 'number' && userNivel >= min;
}

/** Extrai o maior nível de uma resposta da API de confiabilidades gov.br. */
export function maiorNivel(payload: unknown): number | null {
  const lista = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.niveis)
      ? (payload as any).niveis
      : [];
  const ids = lista
    .map((item: any) => Number(item?.id ?? item?.nivel ?? item))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 3);
  return ids.length ? Math.max(...ids) : null;
}

@Injectable()
export class ConfiabilidadeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const min = this.reflector.getAllAndOverride<number>(CONFIABILIDADE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!min) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Não autenticado.');
    if (!atendeNivel(user.nivel, min)) {
      throw new ForbiddenException(
        'Esta ação exige um nível de confiabilidade gov.br mais alto (selo prata/ouro).',
      );
    }
    return true;
  }
}
