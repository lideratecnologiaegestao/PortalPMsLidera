import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { redisCommands } from '../queue/redis.config';

/**
 * Sessoes stateful: registra, verifica, revoga e lista sessoes JWT via
 * user_sessions (PostgreSQL) + Redis (hot path de validade e presenca online).
 *
 * Toda operacao Redis e envolta em try/catch: se o Redis cair, o sistema
 * continua funcionando (degradado). O guard usa fail-open (null = indeterminado).
 */
@Injectable()
export class SessionsService {
  private readonly log = new Logger(SessionsService.name);
  private readonly prefix = process.env.BULLMQ_PREFIX ?? 'portal';

  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ chaves

  private kSess(jti: string) { return `${this.prefix}:psess:${jti}`; }
  private kOnline(tenantKey: string, userId: string) { return `${this.prefix}:ponline:${tenantKey}:${userId}`; }
  private kSeen(jti: string) { return `${this.prefix}:pseen:${jti}`; }

  // --------------------------------------------------------------- helpers internos

  /** Normaliza o IP para PostgreSQL INET (remove prefixo ::ffff: de IPv4-mapeado). */
  private normIp(ip?: string): string | null {
    if (!ip) return null;
    // IPv4-mapeado em IPv6: ::ffff:1.2.3.4 â†’ 1.2.3.4
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (m) return m[1];
    return ip;
  }

  // --------------------------------------------------------------- registrar

  /**
   * Persiste a sessao no banco e no Redis.
   * Para super_admin (tenantId null) usa prisma.platform().
   * Erros de Redis sao absorvidos (login nao deve falhar por causa do Redis).
   */
  async registrar(
    jti: string,
    opts: { userId: string; tenantId: string | null; ip?: string; userAgent?: string; expiraEm: Date },
  ): Promise<void> {
    const { userId, tenantId, ip: rawIp, userAgent, expiraEm } = opts;
    const ip = this.normIp(rawIp);

    // Persiste no banco
    try {
      if (!tenantId) {
        await this.prisma.platform().userSession.create({
          data: { id: jti, userId, tenantId: null, ip: ip ?? null, userAgent: userAgent ?? null, expiraEm },
        });
      } else {
        await this.prisma.db.userSession.create({
          data: { id: jti, userId, tenantId, ip: ip ?? null, userAgent: userAgent ?? null, expiraEm },
        });
      }
    } catch (e) {
      this.log.error(`registrar: falha ao persistir sessao ${jti}: ${(e as Error).message}`);
      // Nao aborta o login â€” a sessao continua valida pelo JWT mesmo sem registro no banco
    }

    // Grava validade no Redis (key de revogacao)
    try {
      const ttl = Math.floor((expiraEm.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await redisCommands.set(this.kSess(jti), '1', 'EX', ttl);
      }
    } catch (e) {
      this.log.warn(`registrar: Redis indisponivel ao gravar sessao ${jti}: ${(e as Error).message}`);
    }
  }

  // ----------------------------------------------------------- estaAtiva

  /**
   * Consulta Redis para saber se a sessao esta ativa.
   * - true  â†’ existe no Redis (ativa)
   * - false â†’ nao existe (revogada ou expirou no Redis)
   * - null  â†’ erro de Redis (indeterminado â†’ fail-open no guard)
   */
  async estaAtiva(jti: string): Promise<boolean | null> {
    try {
      const v = await redisCommands.exists(this.kSess(jti));
      return v === 1;
    } catch (e) {
      this.log.warn(`estaAtiva: Redis indisponivel para jti ${jti}: ${(e as Error).message}`);
      return null;
    }
  }

  // --------------------------------------------------------------- heartbeat

  /**
   * Marca o usuario como online e atualiza ultima_atividade_em no banco
   * (throttled: maximo uma escrita a cada 2 minutos por sessao).
   * Toda operacao e best-effort (nunca lanca).
   */
  async heartbeat(jti: string, userId: string, tenantId: string | null): Promise<void> {
    const tenantKey = tenantId ?? 'plat';
    try {
      // Marca presenca online (TTL 5 min = 300s)
      await redisCommands.set(this.kOnline(tenantKey, userId), '1', 'EX', 300);

      // Throttle: so escreve no banco se pseen nao existir
      const seenKey = this.kSeen(jti);
      const jaVisto = await redisCommands.exists(seenKey);
      if (!jaVisto) {
        await redisCommands.set(seenKey, '1', 'EX', 120);
        // Atualiza ultima_atividade_em no banco (best-effort, sem await de critica)
        this.atualizarAtividade(jti, tenantId).catch(() => undefined);
      }
    } catch {
      // best-effort â€” nunca lanca
    }
  }

  private async atualizarAtividade(jti: string, tenantId: string | null): Promise<void> {
    try {
      if (!tenantId) {
        await this.prisma.platform().userSession.updateMany({
          where: { id: jti, revogadoEm: null },
          data: { ultimaAtividadeEm: new Date() },
        });
      } else {
        await this.prisma.db.userSession.updateMany({
          where: { id: jti, revogadoEm: null },
          data: { ultimaAtividadeEm: new Date() },
        });
      }
    } catch {
      // best-effort
    }
  }

  // ---------------------------------------------------------------- revogar

  /** Revoga uma sessao: marca no banco e deleta a chave Redis. */
  async revogar(jti: string, porUserId?: string, tenantId?: string | null): Promise<void> {
    try {
      if (tenantId === null || tenantId === undefined) {
        // Tentamos tanto via platform() quanto via db (para cobrir ambos os casos)
        await this.prisma.platform().userSession.updateMany({
          where: { id: jti, revogadoEm: null },
          data: { revogadoEm: new Date(), revogadoPor: porUserId ?? null },
        });
      } else {
        await this.prisma.db.userSession.updateMany({
          where: { id: jti, revogadoEm: null },
          data: { revogadoEm: new Date(), revogadoPor: porUserId ?? null },
        });
      }
    } catch (e) {
      this.log.warn(`revogar: falha ao revogar sessao ${jti} no banco: ${(e as Error).message}`);
    }

    try {
      await redisCommands.del(this.kSess(jti));
    } catch (e) {
      this.log.warn(`revogar: falha ao deletar chave Redis ${jti}: ${(e as Error).message}`);
    }
  }

  /**
   * Revoga TODAS as sessões ativas de um usuário (banco + Redis). Usado ao
   * bloquear/desativar ou resetar a senha de um usuário — o JwtAuthGuard checa
   * apenas a sessão (não o flag `ativo`), então sem revogar a sessão atual
   * continuaria válida até o JWT expirar. Cross-tenant via platform().
   * Retorna quantas sessões foram revogadas.
   */
  async revogarTodasDoUsuario(
    userId: string,
    tenantId: string | null,
    porUserId?: string,
  ): Promise<number> {
    const whereBase = tenantId ? { userId, tenantId } : { userId };
    let jtis: { id: string }[] = [];
    try {
      jtis = await this.prisma.platform().userSession.findMany({
        where: { ...whereBase, revogadoEm: null },
        select: { id: true },
      });
    } catch (e) {
      this.log.warn(`revogarTodasDoUsuario: falha ao listar sessões de ${userId}: ${(e as Error).message}`);
    }

    try {
      await this.prisma.platform().userSession.updateMany({
        where: { ...whereBase, revogadoEm: null },
        data: { revogadoEm: new Date(), revogadoPor: porUserId ?? null },
      });
    } catch (e) {
      this.log.warn(`revogarTodasDoUsuario: falha ao revogar no banco para ${userId}: ${(e as Error).message}`);
    }

    for (const s of jtis) {
      try {
        await redisCommands.del(this.kSess(s.id));
      } catch (e) {
        this.log.warn(`revogarTodasDoUsuario: falha ao deletar chave Redis ${s.id}: ${(e as Error).message}`);
      }
    }
    return jtis.length;
  }

  // ------------------------------------------------------------- listarAtivas

  /**
   * Lista sessoes ativas do tenant (sem dado sensivel).
   * Online = chave Redis ponline existe OU ultima_atividade_em nos ultimos 5 min.
   */
  async listarAtivas(tenantId: string): Promise<SessaoAtiva[]> {
    const agora = new Date();
    const cincoMinAtras = new Date(agora.getTime() - 5 * 60 * 1000);

    const rows = await this.prisma.db.userSession.findMany({
      where: {
        revogadoEm: null,
        expiraEm: { gt: agora },
      },
      include: {
        user: { select: { id: true, nome: true, email: true, role: true } },
      },
      orderBy: { ultimaAtividadeEm: 'desc' },
    });

    const result: SessaoAtiva[] = [];
    for (const s of rows) {
      let online = s.ultimaAtividadeEm >= cincoMinAtras;
      if (!online) {
        try {
          const ex = await redisCommands.exists(this.kOnline(tenantId, s.userId));
          online = ex === 1;
        } catch {
          // best-effort
        }
      }
      result.push({
        id: s.id,
        userId: s.userId,
        nome: s.user.nome,
        email: s.user.email ?? '',
        role: s.user.role as unknown as string,
        ip: s.ip ?? null,
        userAgent: s.userAgent ?? null,
        criadoEm: s.criadoEm,
        ultimaAtividadeEm: s.ultimaAtividadeEm,
        online,
      });
    }
    return result;
  }

  // -------------------------------------------------------- usuariosOnline

  /** Conta usuarios distintos com sessao ativa "online" no tenant. */
  async usuariosOnline(tenantId: string): Promise<number> {
    const agora = new Date();
    const cincoMinAtras = new Date(agora.getTime() - 5 * 60 * 1000);

    // Usuarios com atividade recente no banco
    const rows = await this.prisma.db.userSession.findMany({
      where: {
        revogadoEm: null,
        expiraEm: { gt: agora },
        ultimaAtividadeEm: { gte: cincoMinAtras },
      },
      select: { userId: true },
      distinct: ['userId'],
    }).catch(() => [] as { userId: string }[]);

    return rows.length;
  }

  // ------------------------------------------------------------- minhasSessoes

  /** Lista sessoes ativas do proprio usuario. */
  async minhasSessoes(userId: string, tenantId: string | null): Promise<SessaoAtiva[]> {
    const agora = new Date();
    let rows: any[];
    if (!tenantId) {
      rows = await this.prisma.platform().userSession.findMany({
        where: { userId, revogadoEm: null, expiraEm: { gt: agora } },
        include: { user: { select: { id: true, nome: true, email: true, role: true } } },
        orderBy: { ultimaAtividadeEm: 'desc' },
      });
    } else {
      rows = await this.prisma.db.userSession.findMany({
        where: { userId, revogadoEm: null, expiraEm: { gt: agora } },
        include: { user: { select: { id: true, nome: true, email: true, role: true } } },
        orderBy: { ultimaAtividadeEm: 'desc' },
      });
    }

    return rows.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      nome: s.user.nome,
      email: s.user.email ?? '',
      role: String(s.user.role),
      ip: s.ip ?? null,
      userAgent: s.userAgent ?? null,
      criadoEm: s.criadoEm,
      ultimaAtividadeEm: s.ultimaAtividadeEm,
      online: false, // informacao de presenca nao exposta em minhas sessoes
    }));
  }

  /** Revoga uma sessao do proprio usuario (valida que a sessao pertence a ele). */
  async revogarMinha(jti: string, userId: string, tenantId: string | null): Promise<void> {
    let sessao: any;
    if (!tenantId) {
      sessao = await this.prisma.platform().userSession.findFirst({
        where: { id: jti, userId, revogadoEm: null },
        select: { id: true },
      });
    } else {
      sessao = await this.prisma.db.userSession.findFirst({
        where: { id: jti, userId, revogadoEm: null },
        select: { id: true },
      });
    }
    if (!sessao) return; // nao existe ou nao pertence ao usuario â€” silencioso
    await this.revogar(jti, userId, tenantId);
  }
}

export interface SessaoAtiva {
  id: string;
  userId: string;
  nome: string;
  email: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
  criadoEm: Date;
  ultimaAtividadeEm: Date;
  online: boolean;
}

