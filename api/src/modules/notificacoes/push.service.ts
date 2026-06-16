import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

/**
 * Push via Expo Push API (App do Cidadão). O pipeline de notificações já chama
 * `enviar()`; a entrega só ocorre quando o app móvel existir e registrar tokens.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  async registrar(userId: string, token: string, plataforma?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.pushToken.upsert({
      where: { token },
      create: { tenantId, userId, token, plataforma: plataforma ?? null },
      update: { userId, plataforma: plataforma ?? null },
    });
    return { ok: true };
  }

  async remover(token: string) {
    await this.prisma.db.pushToken.deleteMany({ where: { token } });
    return { ok: true };
  }

  async tokensDoUsuario(userId: string): Promise<string[]> {
    const rows = await this.prisma.db.pushToken.findMany({ where: { userId }, select: { token: true } });
    return rows.map((r) => r.token);
  }

  /** Envia para tokens Expo. `dados` segue no payload p/ deep-link ao tocar. */
  async enviar(tokens: string[], titulo: string, corpo: string, dados?: Record<string, unknown>): Promise<number> {
    const expo = tokens.filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'));
    if (!expo.length) return 0;
    const mensagens = expo.map((to) => ({ to, title: titulo, body: corpo, sound: 'default', data: dados ?? {} }));
    await firstValueFrom(
      this.http.post('https://exp.host/--/api/v2/push/send', mensagens, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }),
    );
    return expo.length;
  }
}
