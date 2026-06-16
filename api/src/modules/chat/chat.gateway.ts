import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisConnection } from '../queue/redis.config';
import { COOKIE_SESSION } from '../auth/govbr.config';
import { verifySession } from '../auth/session-token';

interface SocketUser { sub: string; tenantId: string; role: string; nome?: string }

function lerCookie(raw: string | undefined, nome: string): string | undefined {
  if (!raw) return undefined;
  for (const par of raw.split(';')) {
    const [k, ...v] = par.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Gateway de tempo real do chat interno (socket.io sob /api/socket.io).
 * - Autentica pelo cookie de sessão (ou Bearer no app); só usuários INTERNOS.
 * - Salas: `tenant:<id>`, `user:<id>` e `conv:<id>` (entrada validada por
 *   participação — fecha vazamento cross-tenant/conversa).
 * - Adaptador Redis (pub/sub) para escalar horizontalmente; presença e
 *   "digitando" são difundidos pelas salas.
 */
@WebSocketGateway({ path: '/api/socket.io', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(ChatGateway.name);
  @WebSocketServer() server!: Server;
  private onlineMap = new Map<string, Set<string>>(); // userId -> socketIds

  constructor(private readonly prisma: PrismaService) {}

  afterInit(server: Server) {
    try {
      const pub = redisConnection.duplicate();
      const sub = redisConnection.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.log.log('Socket.IO com adaptador Redis (escala horizontal).');
    } catch (e) {
      this.log.warn(`Adaptador Redis indisponível, seguindo em memória: ${(e as Error).message}`);
    }
  }

  private async autenticar(socket: Socket): Promise<SocketUser | null> {
    const token =
      lerCookie(socket.handshake.headers.cookie, COOKIE_SESSION) ||
      (socket.handshake.auth?.token as string | undefined);
    if (!token) return null;
    try {
      const c = await verifySession(token);
      if (!c.tenantId || c.role === 'cidadao') return null; // só internos
      return { sub: c.sub, tenantId: c.tenantId, role: c.role };
    } catch {
      return null;
    }
  }

  async handleConnection(socket: Socket) {
    const user = await this.autenticar(socket);
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    socket.join(`tenant:${user.tenantId}`);
    socket.join(`user:${user.sub}`);

    const set = this.onlineMap.get(user.sub) ?? new Set<string>();
    const eraOffline = set.size === 0;
    set.add(socket.id);
    this.onlineMap.set(user.sub, set);
    if (eraOffline) this.server.to(`tenant:${user.tenantId}`).emit('presenca', { userId: user.sub, online: true });
  }

  handleDisconnect(socket: Socket) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) return;
    const set = this.onlineMap.get(user.sub);
    if (!set) return;
    set.delete(socket.id);
    if (set.size === 0) {
      this.onlineMap.delete(user.sub);
      this.server.to(`tenant:${user.tenantId}`).emit('presenca', { userId: user.sub, online: false });
    }
  }

  /** Cliente pede para entrar nas suas conversas — VALIDA participação. */
  @SubscribeMessage('entrar')
  async entrar(socket: Socket, conversaIds: string[]) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !Array.isArray(conversaIds) || !conversaIds.length) return;
    await TenantContext.run({ tenantId: user.tenantId, userId: user.sub }, async () => {
      const validas = await this.prisma.db.chatParticipante.findMany({
        where: { userId: user.sub, conversaId: { in: conversaIds.slice(0, 200) } },
        select: { conversaId: true },
      });
      for (const v of validas) socket.join(`conv:${v.conversaId}`);
    });
  }

  @SubscribeMessage('typing')
  typing(socket: Socket, payload: { conversaId: string }) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !payload?.conversaId) return;
    socket.to(`conv:${payload.conversaId}`).emit('typing', { conversaId: payload.conversaId, userId: user.sub });
  }

  // ----------------- usados pelo ChatService -----------------
  emitirConversa(conversaId: string, evento: string, payload: unknown) {
    this.server?.to(`conv:${conversaId}`).emit(evento, payload);
  }
  emitirUsuario(userId: string, evento: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(evento, payload);
  }
  online(): Set<string> {
    return new Set(this.onlineMap.keys());
  }
}
