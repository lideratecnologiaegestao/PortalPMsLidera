import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { SessionsService } from '../sessions/sessions.service';

export interface FiltroRelatorio {
  dataDe?: string;
  dataAte?: string;
}

export interface RelatorioUsuarios {
  geradoEm: string;
  resumo: {
    total: number;
    ativos: number;
    inativos: number;
    comMfa: number;
    porPapel: { papel: string; total: number }[];
    porGrupo: { grupo: string; membros: number }[];
    onlineAgora: number;
  };
  logins: {
    data: string;
    acao: string;
    atorId: string | null;
    nomeAtor: string | null;
    email: string | null;
  }[];
  ultimosAcessos: {
    id: string;
    nome: string;
    email: string;
    papel: string;
    ultimoLoginEm: string | null;
    ativo: boolean;
  }[];
}

const ACOES_LOGIN = ['LOGIN_LOCAL', 'LOGIN_GOVBR', 'LOGIN_CIDADAO', 'LOGIN_FALHOU'];

@Injectable()
export class UsersRelatorioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async nomeTenant(): Promise<string> {
    try {
      const tenantId = TenantContext.tenantId();
      if (!tenantId) return 'Plataforma';
      const tenant = await this.prisma.platform().tenant.findUnique({
        where: { id: tenantId },
        select: { nome: true },
      });
      return tenant?.nome ?? tenantId;
    } catch {
      return 'Prefeitura';
    }
  }

  async relatorio(filtro: FiltroRelatorio = {}): Promise<RelatorioUsuarios> {
    const tenantId = TenantContext.tenantId()!;

    // ---- Resumo de usuários ----
    const [total, ativos, inativos, comMfa, papeis, grupos] = await Promise.all([
      this.prisma.db.user.count({}),
      this.prisma.db.user.count({ where: { ativo: true } }),
      this.prisma.db.user.count({ where: { ativo: false } }),
      this.prisma.db.user.count({ where: { mfaHabilitado: true } }),
      // GroupBy role
      this.prisma.db.user.groupBy({ by: ['role'], _count: { _all: true } }),
      // Grupos com contagem de membros
      this.prisma.db.grupoAcesso.findMany({
        where: { ativo: true },
        select: {
          nome: true,
          _count: { select: { membros: true } },
        },
        orderBy: { nome: 'asc' },
      }),
    ]);

    const onlineAgora = await this.sessions.usuariosOnline(tenantId);

    const porPapel = papeis.map((p) => ({
      papel: p.role,
      total: p._count._all,
    }));

    const porGrupo = grupos.map((g) => ({
      grupo: g.nome,
      membros: g._count.membros,
    }));

    // ---- Logins recentes (audit_log) ----
    const whereLog: Record<string, unknown> = {
      acao: { in: ACOES_LOGIN },
    };
    if (filtro.dataDe || filtro.dataAte) {
      const c: Record<string, Date> = {};
      if (filtro.dataDe) c.gte = new Date(filtro.dataDe);
      if (filtro.dataAte) c.lte = new Date(`${filtro.dataAte}T23:59:59`);
      whereLog.criadoEm = c;
    }

    const logRows = await this.prisma.db.auditLog.findMany({
      where: whereLog,
      orderBy: { criadoEm: 'desc' },
      take: 100,
      select: {
        criadoEm: true,
        acao: true,
        atorId: true,
        dados: true,
      },
    });

    // Busca nomes dos atores em batch (ignora os que nao tem atorId)
    const atorIds = [...new Set(logRows.map((r) => r.atorId).filter(Boolean) as string[])];
    const atores = atorIds.length
      ? await this.prisma.db.user.findMany({
          where: { id: { in: atorIds } },
          select: { id: true, nome: true, email: true },
        })
      : [];
    const atorMap = new Map(atores.map((a) => [a.id, a]));

    const logins = logRows.map((r) => {
      const ator = r.atorId ? atorMap.get(r.atorId) : null;
      // LOGIN_FALHOU pode ter email nos dados (sem PII alem do email tentado)
      const dadosEmail = (r.dados as any)?.email ?? null;
      return {
        data: r.criadoEm.toISOString(),
        acao: r.acao,
        atorId: r.atorId,
        nomeAtor: ator?.nome ?? null,
        email: ator?.email ?? dadosEmail ?? null,
      };
    });

    // ---- Últimos acessos ----
    const ultimosAcessosRaw = await this.prisma.db.user.findMany({
      orderBy: { ultimoLoginEm: 'desc' },
      take: 50,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ultimoLoginEm: true,
        ativo: true,
      },
    });

    const ultimosAcessos = ultimosAcessosRaw.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      papel: u.role,
      ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null,
      ativo: u.ativo,
    }));

    return {
      geradoEm: new Date().toISOString(),
      resumo: { total, ativos, inativos, comMfa, porPapel, porGrupo, onlineAgora },
      logins,
      ultimosAcessos,
    };
  }
}
