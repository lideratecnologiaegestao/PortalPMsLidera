import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AplicConfig {
  habilitado: boolean;
  ug: string | null;
}

/**
 * Configuração da fonte APLIC por entidade (ligada/desligada + UG do TCE-MT).
 * As flags vivem em colunas do `tenants`; a leitura por id é feita via
 * prisma.platform() (escape hatch documentado para ler a PRÓPRIA config do
 * tenant — não é consulta cross-tenant de dados).
 */
@Injectable()
export class AplicConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(tenantId: string): Promise<AplicConfig> {
    const t = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: { aplicHabilitado: true, aplicUg: true },
    });
    return { habilitado: t?.aplicHabilitado ?? false, ug: t?.aplicUg ?? null };
  }

  /** Garante que a fonte APLIC está habilitada para a entidade (senão 403). */
  async assertHabilitado(tenantId: string): Promise<AplicConfig> {
    const cfg = await this.obter(tenantId);
    if (!cfg.habilitado) {
      throw new ForbiddenException(
        'A fonte de dados APLIC não está habilitada para esta entidade. Ative no Gerenciador (Configurações da Entidade → Transparência/APLIC).',
      );
    }
    return cfg;
  }
}
