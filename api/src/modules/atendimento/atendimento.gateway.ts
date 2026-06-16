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
import { redisConnection } from '../queue/redis.config';
import { verifySession } from '../auth/session-token';
import { verificarVisitante } from './visitor-token.util';
import { COOKIE_SESSION } from '../auth/govbr.config';

interface VisitorData {
  tipo: 'visitante';
  conversaId: string;
  tenantId: string;
}

interface AgenteData {
  tipo: 'agente';
  sub: string;
  tenantId: string;
  role: string;
  nome?: string;
}

type SocketData = VisitorData | AgenteData;

function lerCookie(raw: string | undefined, nome: string): string | undefined {
  if (!raw) return undefined;
  for (const par of raw.split(';')) {
    const [k, ...v] = par.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Gateway de tempo real para o módulo de Atendimento Omnichannel.
 * Namespace /atendimento, path /api/socket.io (mesmo que ChatGateway).
 *
 * - Visitante anônimo: autenticado por Bearer token JWT (visitor-token).
 *   Entra APENAS na sala atend:<conversaId>.
 * - Agente: autenticado por cookie de sessão ou Bearer. Pode entrar em
 *   salas de conversas específicas ou na sala do tenant.
 *
 * Adaptador Redis para escala horizontal (mesma infra do ChatGateway).
 */
@WebSocketGateway({
  namespace: '/atendimento',
  path: '/api/socket.io',
  cors: { origin: true, credentials: true },
})
export class AtendimentoGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(AtendimentoGateway.name);
  @WebSocketServer() server!: Server;

  afterInit(server: Server) {
    try {
      const pub = redisConnection.duplicate();
      const sub = redisConnection.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.log.log('AtendimentoGateway: adaptador Redis ativo.');
    } catch (e) {
      this.log.warn(
        `AtendimentoGateway: adaptador Redis indisponível, seguindo em memória: ${(e as Error).message}`,
      );
    }
  }

  async handleConnection(socket: Socket) {
    const data = await this.autenticar(socket);
    if (!data) {
      // Não desconecta na conexão — aguarda evento "entrar" para validar
      // (visitante traz token no evento, não no handshake)
      return;
    }
    socket.data = data;

    if (data.tipo === 'agente') {
      socket.join(`tenant:${data.tenantId}`);
      socket.join(`user:${data.sub}`);
    }
  }

  handleDisconnect(_socket: Socket) {
    // Sem presença para visitantes; agentes não precisam de limpeza extra aqui
  }

  /**
   * Visitante entra na sala da sua conversa (valida o token do evento ou
   * reusa o token do handshake).
   */
  @SubscribeMessage('entrar')
  async entrar(socket: Socket, payload: { conversaId: string; token?: string }) {
    if (!payload?.conversaId) return;

    // Se já autenticado como visitante nesta conexão
    const d = socket.data as SocketData | undefined;
    if (d?.tipo === 'visitante') {
      if (d.conversaId !== payload.conversaId) return; // token não bate
      socket.join(`atend:${d.conversaId}`);
      return;
    }

    // Tenta autenticar pelo token do evento
    const token =
      payload.token ||
      (socket.handshake.auth?.token as string | undefined);
    if (!token) return;

    try {
      const claims = await verificarVisitante(token);
      if (claims.conversaId !== payload.conversaId) return;
      socket.data = {
        tipo: 'visitante',
        conversaId: claims.conversaId,
        tenantId: claims.tenantId,
      } satisfies VisitorData;
      socket.join(`atend:${claims.conversaId}`);
    } catch {
      // token inválido — ignora
    }
  }

  /** Agente entra em salas de conversas específicas. */
  @SubscribeMessage('entrar_agente')
  async entrarAgente(socket: Socket, payload: { conversaIds: string[] }) {
    const d = socket.data as SocketData | undefined;
    if (!d || d.tipo !== 'agente') return;
    if (!Array.isArray(payload?.conversaIds)) return;

    for (const cid of payload.conversaIds.slice(0, 200)) {
      socket.join(`atend:${cid}`);
    }
  }

  /** Agente entra na sala do tenant (recebe atend:nova_conversa). */
  @SubscribeMessage('entrar_tenant')
  async entrarTenant(socket: Socket) {
    const d = socket.data as SocketData | undefined;
    if (!d || d.tipo !== 'agente') return;
    socket.join(`tenant:${d.tenantId}`);
  }

  /** Indicador de digitação. */
  @SubscribeMessage('typing')
  typing(socket: Socket, payload: { conversaId: string }) {
    if (!payload?.conversaId) return;
    const d = socket.data as SocketData | undefined;
    if (!d) return;

    const autorTipo = d.tipo === 'visitante' ? 'visitante' : 'agente';
    socket.to(`atend:${payload.conversaId}`).emit('atend:typing', { autorTipo });
  }

  // ---------------------------------------------------------------- métodos públicos

  /** Emite um evento para todos na sala de uma conversa. */
  emitir(conversaId: string, evento: string, payload: unknown) {
    this.server?.to(`atend:${conversaId}`).emit(evento, payload);
  }

  /** Emite um evento para a sala do tenant (agentes conectados). */
  emitirTenant(tenantId: string, evento: string, payload: unknown) {
    this.server?.to(`tenant:${tenantId}`).emit(evento, payload);
  }

  // ---------------------------------------------------------------- autenticação

  private async autenticar(socket: Socket): Promise<SocketData | null> {
    // 1. Tenta token de visitante no auth
    const authToken = socket.handshake.auth?.token as string | undefined;
    if (authToken) {
      try {
        const claims = await verificarVisitante(authToken);
        return {
          tipo: 'visitante',
          conversaId: claims.conversaId,
          tenantId: claims.tenantId,
        };
      } catch {
        // não é token de visitante, tenta sessão de agente
      }
    }

    // 2. Tenta sessão de agente (cookie ou Bearer)
    const sessionToken =
      lerCookie(socket.handshake.headers.cookie, COOKIE_SESSION) || authToken;
    if (!sessionToken) return null;

    try {
      const c = await verifySession(sessionToken);
      if (!c.tenantId || c.role === 'cidadao') return null;
      return {
        tipo: 'agente',
        sub: c.sub,
        tenantId: c.tenantId,
        role: c.role,
      };
    } catch {
      return null;
    }
  }
}
