import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_DEFAULTS, WILDCARD } from './permissions.catalog';

/**
 * Serviço de verificação de permissões granulares.
 *
 * Camada 2 de RBAC: complementa (não substitui) o RolesGuard por papel.
 * O RolesGuard decide "quem pode acessar este endpoint".
 * O PermissionsService decide "quais módulos este usuário pode gerenciar".
 *
 * Acesso ao banco: sempre via this.prisma.db.* (RLS automático por tenant).
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula o conjunto efetivo de permissões de um usuário.
   * Se o papel tiver curinga '*', retorna Set(['*']) imediatamente.
   * Caso contrário, faz union das permissões do papel com as dos grupos ativos.
   */
  async permissoesEfetivas(userId: string, role: string): Promise<Set<string>> {
    const defaults = ROLE_DEFAULTS[role] ?? [];

    if (defaults.includes(WILDCARD)) {
      return new Set([WILDCARD]);
    }

    // Carrega grupos ativos do usuário (RLS isola por tenant automaticamente)
    const usuarioGrupos = await this.prisma.db.usuarioGrupo.findMany({
      where: { userId },
      include: { grupo: true },
    });

    const permissoesGrupos: string[] = [];
    for (const ug of usuarioGrupos) {
      if (ug.grupo.ativo) {
        permissoesGrupos.push(...ug.grupo.permissoes);
      }
    }

    return new Set([...defaults, ...permissoesGrupos]);
  }

  /**
   * Verifica se o usuário tem TODAS as permissões requeridas.
   * Curinga '*' concede acesso a tudo.
   */
  async tem(userId: string, role: string, requeridas: string[]): Promise<boolean> {
    if (requeridas.length === 0) return true;

    const efetivas = await this.permissoesEfetivas(userId, role);

    if (efetivas.has(WILDCARD)) return true;

    return requeridas.every((p) => efetivas.has(p));
  }
}
