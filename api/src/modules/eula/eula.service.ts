import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EULA_OUVIDORIA } from './eula.constants';

@Injectable()
export class EulaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna o EULA vigente + flag se o usuário já aceitou a versão atual.
   */
  async obter(userId: string) {
    const jaAceito = await this.jaAceitou(userId, EULA_OUVIDORIA.versao);
    return {
      versao: EULA_OUVIDORIA.versao,
      titulo: EULA_OUVIDORIA.titulo,
      texto: EULA_OUVIDORIA.texto,
      jaAceito,
    };
  }

  /**
   * Grava o aceite do EULA. Idempotente: se já existe aceite para a mesma
   * (userId, versao), silencia o conflito de unicidade e retorna ok.
   */
  async aceitar(userId: string, ctx: { ip?: string; userAgent?: string }): Promise<void> {
    const tenantId = TenantContext.tenantId()!;

    // upsert-style: se a constraint unique (user_id, versao) já existir, não falha
    await this.prisma.db.eulaAceite
      .create({
        data: {
          tenantId,
          userId,
          versao: EULA_OUVIDORIA.versao,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      })
      .catch((err: any) => {
        // P2002 = Unique constraint violation (já aceitou esta versão)
        if (err?.code === 'P2002') return;
        throw err;
      });

    // Auditoria LGPD art. 37 — evidência de aceite
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: userId,
        acao: 'EULA_ACEITO',
        entidade: 'eula_aceites',
        entidadeId: userId,
        dados: {
          versao: EULA_OUVIDORIA.versao,
          ip: ctx.ip ?? null,
        },
      },
    });
  }

  /**
   * Verifica se o usuário aceitou a versão vigente do EULA.
   * Usado pelo EulaGuard e pelo loginLocal para calcular eulaRequired.
   */
  async jaAceitou(userId: string, versao: string): Promise<boolean> {
    const aceite = await this.prisma.db.eulaAceite.findFirst({
      where: { userId, versao },
      select: { id: true },
    });
    return !!aceite;
  }

  /**
   * Verifica se o usuário precisa aceitar o EULA vigente.
   * Retorna true se o role requer EULA e o usuário ainda não aceitou.
   */
  async eulaRequired(userId: string, role: string): Promise<boolean> {
    const rolesObrigados = ['ouvidor', 'assistente_ouvidoria'];
    if (!rolesObrigados.includes(role)) return false;
    const aceitou = await this.jaAceitou(userId, EULA_OUVIDORIA.versao);
    return !aceitou;
  }
}
