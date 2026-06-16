import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Central de notificações in-app do próprio usuário (RLS por tenant). */
@Injectable()
export class NotificacoesUsuarioService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(userId: string) {
    const [items, naoLidas] = await Promise.all([
      this.prisma.db.notificacaoUsuario.findMany({
        where: { userId },
        orderBy: { criadoEm: 'desc' },
        take: 50,
        select: { id: true, titulo: true, corpo: true, protocolo: true, evento: true, lida: true, criadoEm: true },
      }),
      this.prisma.db.notificacaoUsuario.count({ where: { userId, lida: false } }),
    ]);
    return { items, naoLidas };
  }

  async naoLidas(userId: string) {
    return { total: await this.prisma.db.notificacaoUsuario.count({ where: { userId, lida: false } }) };
  }

  async marcarLidas(userId: string, id?: string) {
    await this.prisma.db.notificacaoUsuario.updateMany({
      where: { userId, lida: false, ...(id ? { id } : {}) },
      data: { lida: true },
    });
    return { ok: true };
  }
}
