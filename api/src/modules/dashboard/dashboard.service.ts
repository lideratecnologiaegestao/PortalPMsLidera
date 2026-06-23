import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PntpService } from '../pntp/pntp.service';

/** Status finais de manifestação (encerradas). */
const ENCERRADAS = ['respondida', 'indeferida', 'parcialmente_atendida', 'concluida', 'arquivada'];
/** Status de chamado que NÃO contam como "aberto". */
const CHAMADO_FECHADO = ['resolvido', 'cancelado', 'duplicado'];

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Tipos de retorno ------------------------------------------------------- */

export interface Alerta {
  nivel: 'critico' | 'alerta' | 'info';
  texto: string;
  href: string;
}

/**
 * Serviço de BI do Painel Administrativo.
 *
 * Agrega dados de todos os módulos (manifestações, chamados, notícias,
 * comentários, atendimento, formulários, documentos, usuários, sessões,
 * LGPD, PNTP) em uma única chamada tolerante a falhas: cada bloco tem seu
 * próprio try/catch e retorna 0/[]/null em caso de erro, garantindo que a
 * falha de um módulo não derrube o dashboard inteiro.
 */
@Injectable()
export class DashboardService {
  private readonly log = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pntp: PntpService,
  ) {}

  // ------------------------------------------------------------------- BI geral

  async obterAgregado() {
    const [
      blocoManif,
      blocoChamados,
      blocoNoticias,
      blocoComentarios,
      blocoAtendimento,
      blocoFormularios,
      blocoDocumentos,
      blocoUsuarios,
      blocoSessoes,
      blocoLgpd,
      blocoPntp,
      blocoSatisfacao,
    ] = await Promise.all([
      this.blocoManifestacoes(),
      this.blocoChamados(),
      this.blocoNoticias(),
      this.blocoComentarios(),
      this.blocoAtendimento(),
      this.blocoFormularios(),
      this.blocoDocumentos(),
      this.blocoUsuarios(),
      this.blocoSessoes(),
      this.blocoLgpd(),
      this.blocoPntp(),
      this.blocoSatisfacao(),
    ]);

    const alertas: Alerta[] = [];
    if (blocoManif.vencidas > 0) {
      alertas.push({ nivel: 'critico', texto: `${blocoManif.vencidas} manifestações com prazo vencido`, href: '/admin/ouvidoria' });
    }
    if (blocoComentarios.pendentes > 0) {
      alertas.push({ nivel: 'alerta', texto: `${blocoComentarios.pendentes} comentários aguardando moderação`, href: '/admin/comentarios' });
    }
    if (blocoLgpd.solicitacoesPendentes > 0) {
      alertas.push({ nivel: 'alerta', texto: `${blocoLgpd.solicitacoesPendentes} solicitações LGPD pendentes`, href: '/admin/lgpd-solicitacoes' });
    }
    if (blocoLgpd.incidentesAbertos > 0) {
      alertas.push({ nivel: 'critico', texto: `${blocoLgpd.incidentesAbertos} incidentes de segurança abertos`, href: '/admin/lgpd-incidentes' });
    }

    return {
      atualizadoEm: new Date().toISOString(),
      kpis: {
        noticiasPublicadas: blocoNoticias.publicadas,
        noticiasMes: blocoNoticias.mes,
        comentariosPendentes: blocoComentarios.pendentes,
        manifestacoesAbertas: blocoManif.abertas,
        manifestacoesVencidas: blocoManif.vencidas,
        chamadosAbertos: blocoChamados.abertos,
        atendimentosAbertos: blocoAtendimento.abertos,
        formulariosRespostasMes: blocoFormularios.respostasMes,
        documentos: blocoDocumentos.total,
        usuariosAtivos: blocoUsuarios.ativos,
        sessoesOnline: blocoSessoes.online,
        lgpdSolicitacoesPendentes: blocoLgpd.solicitacoesPendentes,
        lgpdIncidentesAbertos: blocoLgpd.incidentesAbertos,
        pntpIndice: blocoPntp.indice,
        pntpSelo: blocoPntp.selo,
      },
      tendencia: this.mesclarTendencia(blocoManif.tendenciaEntradas, blocoManif.tendenciaResolvidas),
      manifestacoesPorStatus: blocoManif.porStatus,
      chamadosPorCategoria: blocoChamados.porCategoria,
      manifestacoesPorSecretaria: blocoManif.porSecretaria,
      satisfacao: blocoSatisfacao,
      filaPrazos: blocoManif.filaPrazos,
      ultimasNoticias: blocoNoticias.ultimas,
      comentariosRecentes: blocoComentarios.recentes,
      alertas,
    };
  }

  // ------------------------------------------------------------------- blocos individuais

  private async blocoManifestacoes() {
    const defaultVal = {
      abertas: 0, vencidas: 0,
      porStatus: [] as { k: string; n: number }[],
      porSecretaria: [] as { k: string; n: number }[],
      filaPrazos: [] as { protocolo: string; tipo: string; status: string; prazoEm: Date; diasRestantes: number }[],
      tendenciaEntradas: [] as { mes: string; n: number }[],
      tendenciaResolvidas: [] as { mes: string; n: number }[],
    };
    try {
      const db = this.prisma.db;

      const [kpi] = await db.$queryRaw<any[]>`
        SELECT
          count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}))::int AS abertas,
          count(*) FILTER (WHERE status::text <> ALL(${ENCERRADAS}) AND prazo_em < now())::int AS vencidas
        FROM manifestacoes`;

      const porStatus = await db.$queryRaw<any[]>`
        SELECT status::text AS k, count(*)::int AS n
        FROM manifestacoes
        GROUP BY status ORDER BY n DESC`;

      const porSecretaria = await db.$queryRaw<any[]>`
        SELECT COALESCE(s.nome, 'Não atribuída') AS k, count(*)::int AS n
        FROM manifestacoes mf LEFT JOIN secretarias s ON s.id = mf.secretaria_id
        GROUP BY COALESCE(s.nome, 'Não atribuída') ORDER BY n DESC LIMIT 6`;

      const filaPrazos = await db.$queryRaw<any[]>`
        SELECT protocolo, tipo::text AS tipo, status::text AS status, prazo_em,
               round(EXTRACT(EPOCH FROM (prazo_em - now())) / 86400.0)::int AS dias_restantes
        FROM manifestacoes
        WHERE status::text <> ALL(${ENCERRADAS})
        ORDER BY prazo_em ASC NULLS LAST
        LIMIT 6`;

      const tendenciaEntradas = await db.$queryRaw<any[]>`
        SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS mes, count(*)::int AS n FROM (
          SELECT criado_em AS d FROM manifestacoes WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
          UNION ALL
          SELECT criado_em FROM chamados WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
        ) x GROUP BY 1 ORDER BY 1`;

      const tendenciaResolvidas = await db.$queryRaw<any[]>`
        SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS mes, count(*)::int AS n FROM (
          SELECT respondido_em AS d FROM manifestacoes WHERE respondido_em >= date_trunc('month', now()) - interval '5 months'
          UNION ALL
          SELECT resolvido_em FROM chamados WHERE resolvido_em >= date_trunc('month', now()) - interval '5 months'
        ) x GROUP BY 1 ORDER BY 1`;

      return {
        abertas: num(kpi?.abertas),
        vencidas: num(kpi?.vencidas),
        porStatus: porStatus.map((r) => ({ k: r.k, n: num(r.n) })),
        porSecretaria: porSecretaria.map((r) => ({ k: r.k, n: num(r.n) })),
        filaPrazos: filaPrazos.map((r) => ({
          protocolo: r.protocolo,
          tipo: r.tipo,
          status: r.status,
          prazoEm: r.prazo_em,
          diasRestantes: num(r.dias_restantes),
        })),
        tendenciaEntradas,
        tendenciaResolvidas,
      };
    } catch (e) {
      this.log.error(`blocoManifestacoes: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoChamados() {
    const defaultVal = { abertos: 0, porCategoria: [] as { k: string; n: number }[] };
    try {
      const db = this.prisma.db;

      const [kpi] = await db.$queryRaw<any[]>`
        SELECT count(*) FILTER (WHERE status::text <> ALL(${CHAMADO_FECHADO}))::int AS abertos
        FROM chamados`;

      const porCategoria = await db.$queryRaw<any[]>`
        SELECT categoria::text AS k, count(*)::int AS n
        FROM chamados GROUP BY categoria ORDER BY n DESC LIMIT 8`;

      return {
        abertos: num(kpi?.abertos),
        porCategoria: porCategoria.map((r) => ({ k: r.k, n: num(r.n) })),
      };
    } catch (e) {
      this.log.error(`blocoChamados: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoNoticias() {
    const defaultVal = {
      publicadas: 0, mes: 0,
      ultimas: [] as { id: string; titulo: string; publicadoEm: Date | null; status: string }[],
    };
    try {
      const db = this.prisma.db;

      const publicadas = await db.noticia.count({ where: { publicado: true } });
      const mes = await db.noticia.count({
        where: {
          publicado: true,
          publicadoEm: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      });

      const ultimasRaw = await db.noticia.findMany({
        orderBy: { criadoEm: 'desc' },
        take: 5,
        select: { id: true, titulo: true, publicadoEm: true, publicado: true },
      });

      return {
        publicadas,
        mes,
        ultimas: ultimasRaw.map((n) => ({
          id: n.id,
          titulo: n.titulo,
          publicadoEm: n.publicadoEm,
          status: n.publicado ? 'publicado' : 'rascunho',
        })),
      };
    } catch (e) {
      this.log.error(`blocoNoticias: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoComentarios() {
    const defaultVal = {
      pendentes: 0,
      recentes: [] as { id: string; noticiaTitulo: string; autor: string; texto: string; criadoEm: Date; aprovado: boolean }[],
    };
    try {
      const db = this.prisma.db;

      const pendentes = await db.noticiaComentario.count({ where: { status: 'pendente' } });

      const recentes = await db.$queryRaw<any[]>`
        SELECT c.id::text AS id, n.titulo AS "noticiaTitulo",
               c.autor_nome AS autor, c.conteudo AS texto,
               c.criado_em AS "criadoEm",
               (c.status = 'aprovado') AS aprovado
        FROM noticia_comentarios c
        JOIN noticias n ON n.id = c.noticia_id
        ORDER BY c.criado_em DESC
        LIMIT 6`;

      return {
        pendentes,
        recentes: recentes.map((r) => ({
          id: r.id,
          noticiaTitulo: r.noticiaTitulo,
          autor: r.autor,
          texto: r.texto,
          criadoEm: r.criadoEm,
          aprovado: Boolean(r.aprovado),
        })),
      };
    } catch (e) {
      this.log.error(`blocoComentarios: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoAtendimento() {
    const defaultVal = { abertos: 0 };
    try {
      const db = this.prisma.db;
      // status 'bot', 'aguardando', 'em_atendimento' = ativos; 'encerrado'/'resolvido' = fechados
      const abertos = await db.atendimentoConversa.count({
        where: { encerradaEm: null },
      });
      return { abertos };
    } catch (e) {
      this.log.error(`blocoAtendimento: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoFormularios() {
    const defaultVal = { respostasMes: 0 };
    try {
      const db = this.prisma.db;
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const respostasMes = await db.formularioEnvio.count({
        where: { criadoEm: { gte: inicioMes } },
      });
      return { respostasMes };
    } catch (e) {
      this.log.error(`blocoFormularios: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoDocumentos() {
    const defaultVal = { total: 0 };
    try {
      const db = this.prisma.db;
      const total = await db.documento.count({ where: { ativo: true } });
      return { total };
    } catch (e) {
      this.log.error(`blocoDocumentos: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoUsuarios() {
    const defaultVal = { ativos: 0 };
    try {
      const db = this.prisma.db;
      // Usuários servidores/gestores/admins ativos (não cidadãos, não bots)
      const ativos = await db.user.count({
        where: {
          ativo: true,
          isBot: false,
          role: { not: 'cidadao' },
        },
      });
      return { ativos };
    } catch (e) {
      this.log.error(`blocoUsuarios: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoSessoes() {
    const defaultVal = { online: 0 };
    try {
      const db = this.prisma.db;
      const agora = new Date();
      const cincoMinAtras = new Date(agora.getTime() - 5 * 60 * 1000);
      // Sessões não revogadas, não expiradas e com atividade recente (online)
      const online = await db.userSession.count({
        where: {
          revogadoEm: null,
          expiraEm: { gt: agora },
          ultimaAtividadeEm: { gte: cincoMinAtras },
        },
      });
      return { online };
    } catch (e) {
      this.log.error(`blocoSessoes: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoLgpd() {
    const defaultVal = { solicitacoesPendentes: 0, incidentesAbertos: 0 };
    try {
      const db = this.prisma.db;
      const [solicitacoesPendentes, incidentesAbertos] = await Promise.all([
        db.solicitacaoTitular.count({ where: { status: 'aberta' } }),
        db.incidenteSeguranca.count({
          where: { status: { notIn: ['resolvido', 'encerrado', 'arquivado'] } },
        }),
      ]);
      return { solicitacoesPendentes, incidentesAbertos };
    } catch (e) {
      this.log.error(`blocoLgpd: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoPntp() {
    const defaultVal = { indice: 0, selo: 'Inexistente' };
    try {
      const resultado = await this.pntp.conformidade();
      return { indice: resultado.indice, selo: resultado.selo };
    } catch (e) {
      this.log.error(`blocoPntp: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  private async blocoSatisfacao() {
    const defaultVal = {
      media: null as number | null,
      total: 0,
      distribuicao: [1, 2, 3, 4, 5].map((nota) => ({ nota, n: 0 })),
    };
    try {
      const db = this.prisma.db;
      const [s] = await db.$queryRaw<any[]>`
        SELECT count(*)::int AS total, avg(nota)::numeric(10,2) AS media
        FROM pesquisa_satisfacao`;
      const dist = await db.$queryRaw<any[]>`
        SELECT nota::int AS nota, count(*)::int AS n
        FROM pesquisa_satisfacao GROUP BY nota ORDER BY nota`;
      const distMap = new Map(dist.map((r) => [num(r.nota), num(r.n)]));
      return {
        media: s?.media != null ? Number(s.media) : null,
        total: num(s?.total),
        distribuicao: [1, 2, 3, 4, 5].map((nota) => ({ nota, n: distMap.get(nota) ?? 0 })),
      };
    } catch (e) {
      this.log.error(`blocoSatisfacao: ${(e as Error).message}`);
      return defaultVal;
    }
  }

  // ------------------------------------------------------------------- tendência

  private mesclarTendencia(
    entradas: { mes: string; n: number }[],
    resolvidas: { mes: string; n: number }[],
  ) {
    const meses: string[] = [];
    const base = new Date();
    base.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const eMap = new Map(entradas.map((r) => [r.mes, num(r.n)]));
    const rMap = new Map(resolvidas.map((r) => [r.mes, num(r.n)]));
    return meses.map((mes) => ({ mes, entradas: eMap.get(mes) ?? 0, resolvidas: rMap.get(mes) ?? 0 }));
  }

  // ------------------------------------------------------------------- nota pessoal

  async obterNota(usuarioId: string): Promise<{ conteudo: string; atualizadoEm: string | null }> {
    const rows = await this.prisma.db.$queryRaw<{ conteudo: string; atualizado_em: Date }[]>`
      SELECT conteudo, atualizado_em
      FROM dashboard_notas
      WHERE usuario_id = ${usuarioId}::uuid
      LIMIT 1`;

    if (!rows.length) {
      return { conteudo: '', atualizadoEm: null };
    }
    return {
      conteudo: rows[0].conteudo,
      atualizadoEm: rows[0].atualizado_em.toISOString(),
    };
  }

  async upsertNota(tenantId: string, usuarioId: string, conteudo: string): Promise<{ conteudo: string; atualizadoEm: string }> {
    const rows = await this.prisma.db.$queryRaw<{ conteudo: string; atualizado_em: Date }[]>`
      INSERT INTO dashboard_notas (tenant_id, usuario_id, conteudo)
      VALUES (${tenantId}::uuid, ${usuarioId}::uuid, ${conteudo})
      ON CONFLICT (tenant_id, usuario_id)
      DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now()
      RETURNING conteudo, atualizado_em`;

    return {
      conteudo: rows[0].conteudo,
      atualizadoEm: rows[0].atualizado_em.toISOString(),
    };
  }
}
