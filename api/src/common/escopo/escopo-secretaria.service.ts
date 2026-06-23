import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Helper compartilhado de escopo de secretaria (ADR-0005 Fase 4).
 *
 * Regra:
 *  - role ∉ {gestor, servidor} → retorna `undefined` (sem escopo, vê tudo).
 *  - role ∈ {gestor, servidor} → lê `users.secretaria_id` e retorna o uuid.
 *    Se o usuário não tiver lotação → retorna `null` (escopo "nenhuma secretaria",
 *    não deve gerenciar nenhum conteúdo escopado).
 *
 * Controllers chamam `resolver(user?.sub, user?.role)` e passam o resultado
 * para os métodos de serviço.
 */
@Injectable()
export class EscopoSecretariaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna:
   *  - `undefined`  → role sem escopo (admin_prefeitura, ti, super_admin, etc.) — vê tudo.
   *  - `string`     → UUID da secretaria do usuário — filtrar por ela.
   *  - `null`       → gestor/servidor sem lotação definida — não gerencia conteúdo escopado.
   */
  async resolver(userId?: string, role?: string): Promise<string | null | undefined> {
    if (!role || !['gestor', 'servidor'].includes(role)) {
      return undefined; // sem escopo
    }
    if (!userId) {
      return null; // gestor/servidor mas sem userId — seguro: bloqueia
    }
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { secretariaId: true },
    });
    // u?.secretariaId pode ser string (uuid) ou null
    return u?.secretariaId ?? null;
  }
}
