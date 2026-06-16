import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

export interface FiltroManifestacao {
  canal?: string;
  status?: string;
  tipo?: string;
  q?: string;
  responsavelId?: string;
  secretariaId?: string;
  escopoSecretariaId?: string;
  dataDe?: string;
  dataAte?: string;
}

const ABERTOS = [
  'registrada', 'em_analise', 'em_tratamento', 'aguardando_cidadao',
  'prorrogada', 'recurso_1a_instancia', 'recurso_2a_instancia',
];

@Injectable()
export class ManifestacoesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Monta o filtro comum (lista, export e relatório). */
  private montarWhere(opts: FiltroManifestacao): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (opts.canal) where.canal = opts.canal;
    if (opts.status) where.status = opts.status;
    if (opts.tipo) where.tipo = opts.tipo;
    if (opts.responsavelId) where.responsavelId = opts.responsavelId;
    // Separação por departamento: o escopo forçado (servidor da área) tem
    // precedência sobre o filtro escolhido na tela.
    const sec = opts.escopoSecretariaId ?? opts.secretariaId;
    if (sec) where.secretariaId = sec;
    if (opts.dataDe || opts.dataAte) {
      const c: Record<string, Date> = {};
      if (opts.dataDe) c.gte = new Date(opts.dataDe);
      if (opts.dataAte) c.lte = new Date(`${opts.dataAte}T23:59:59`);
      where.criadoEm = c;
    }
    if (opts.q) {
      where.OR = [
        { assunto: { contains: opts.q, mode: 'insensitive' } },
        { protocolo: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /**
   * Escopo de departamento do usuário: servidores de área veem só a sua
   * secretaria; ouvidor/gestor/admin veem tudo (retorna undefined).
   */
  async escopoSecretaria(userId?: string, role?: string): Promise<string | undefined> {
    if (!userId || role !== 'servidor') return undefined;
    const u = await this.prisma.db.user.findUnique({ where: { id: userId }, select: { secretariaId: true } });
    return u?.secretariaId ?? undefined;
  }

  async listar(opts: FiltroManifestacao & { page: number; pageSize: number }) {
    const where = this.montarWhere(opts);

    const [raw, total] = await Promise.all([
      this.prisma.db.manifestacao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          protocolo: true,
          canal: true,
          tipo: true,
          status: true,
          assunto: true,
          prazoEm: true,
          prorrogado: true,
          anonima: true,
          solicitanteNome: true,
          responsavelId: true,
          secretariaId: true,
          criadoEm: true,
        },
      }),
      this.prisma.db.manifestacao.count({ where }),
    ]);

    // LGPD: mascara identidade de manifestações anônimas
    const items = raw.map((m) => ({
      ...m,
      solicitanteNome: m.anonima ? null : m.solicitanteNome,
    }));

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async detalhe(id: string) {
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id },
      include: {
        eventos: {
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            evento: true,
            deStatus: true,
            paraStatus: true,
            observacao: true,
            atorId: true,
            criadoEm: true,
          },
        },
      },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    // LGPD: mascara identidade se anônima; NUNCA expõe CPF (não está no select)
    // ManifestacaoEvento.id é BigInt — converte para string para JSON
    const eventos = (m.eventos ?? []).map((e) => ({ ...e, id: String(e.id) }));
    return {
      ...m,
      eventos,
      solicitanteNome: m.anonima ? null : m.solicitanteNome,
      // cidadaoId mantido para uso interno (referência ao User), não expõe dados pessoais
    };
  }

  /** Atribuição administrativa (responsável / secretaria). NÃO altera status. */
  async atribuir(
    id: string,
    dados: { responsavelId?: string; secretariaId?: string },
    atorId?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const data: Record<string, unknown> = {};
    if (dados.responsavelId !== undefined) data.responsavelId = dados.responsavelId;
    if (dados.secretariaId !== undefined) data.secretariaId = dados.secretariaId;

    const atualizada = await this.prisma.db.manifestacao.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        protocolo: true,
        responsavelId: true,
        secretariaId: true,
        status: true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'MANIFESTACAO_ATRIBUIDA',
        entidade: 'manifestacoes',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizada;
  }

  // ----------------------------------------------- export (linha a linha)
  /** Linhas para export CSV/JSON (sem paginação; mascara anônimos). */
  async listarParaExport(opts: FiltroManifestacao) {
    const where = this.montarWhere(opts);
    const rows = await this.prisma.db.manifestacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 5000,
      select: {
        protocolo: true, canal: true, tipo: true, status: true, assunto: true,
        anonima: true, solicitanteNome: true, secretariaId: true, prazoEm: true,
        prorrogado: true, respondidoEm: true, criadoEm: true,
      },
    });
    const nomes = await this.mapaSecretarias();
    return rows.map((m) => ({
      protocolo: m.protocolo,
      canal: m.canal,
      tipo: m.tipo,
      status: m.status,
      assunto: m.assunto,
      solicitante: m.anonima ? '(anônima)' : (m.solicitanteNome ?? ''),
      secretaria: m.secretariaId ? (nomes.get(m.secretariaId) ?? '') : '',
      prazo: m.prazoEm,
      prorrogado: m.prorrogado ? 'sim' : 'não',
      respondidoEm: m.respondidoEm ?? '',
      criadoEm: m.criadoEm,
    }));
  }

  // ----------------------------------------------- relatório agregado
  /** Dados agregados para o relatório/gráficos da Ouvidoria (por período). */
  async relatorioDados(opts: FiltroManifestacao) {
    const where = this.montarWhere(opts);
    const db = this.prisma.db;

    const [total, abertos, respondidas, porTipoRaw, porStatusRaw, porCanalRaw, porSecRaw, sats] =
      await Promise.all([
        db.manifestacao.count({ where }),
        db.manifestacao.count({ where: { ...where, status: { in: ABERTOS } } as any }),
        db.manifestacao.count({ where: { ...where, status: { in: ['respondida', 'parcialmente_atendida', 'concluida'] } } as any }),
        db.manifestacao.groupBy({ by: ['tipo'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['status'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['canal'], where, _count: { _all: true } }),
        db.manifestacao.groupBy({ by: ['secretariaId'], where, _count: { _all: true } }),
        db.pesquisaSatisfacao.findMany({
          where: { manifestacao: where as any },
          select: { nota: true },
        }),
      ]);

    const nomes = await this.mapaSecretarias();
    const distrib = [1, 2, 3, 4, 5].map((n) => ({ nota: n, total: sats.filter((s) => s.nota === n).length }));
    const somaSat = sats.reduce((a, s) => a + s.nota, 0);

    return {
      geradoEm: new Date().toISOString(),
      periodo: { de: opts.dataDe ?? null, ate: opts.dataAte ?? null },
      resumo: {
        total,
        abertos,
        respondidas,
        taxaResposta: total ? Math.round((respondidas / total) * 100) : 0,
      },
      porTipo: porTipoRaw.map((r) => ({ chave: r.tipo, total: r._count._all })).sort((a, b) => b.total - a.total),
      porStatus: porStatusRaw.map((r) => ({ chave: r.status, total: r._count._all })).sort((a, b) => b.total - a.total),
      porCanal: porCanalRaw.map((r) => ({ chave: r.canal, total: r._count._all })),
      porSecretaria: porSecRaw
        .map((r) => ({ chave: r.secretariaId ? (nomes.get(r.secretariaId) ?? 'Sem secretaria') : 'Sem secretaria', total: r._count._all }))
        .sort((a, b) => b.total - a.total),
      satisfacao: {
        total: sats.length,
        media: sats.length ? Number((somaSat / sats.length).toFixed(2)) : 0,
        distribuicao: distrib,
      },
    };
  }

  private async mapaSecretarias(): Promise<Map<string, string>> {
    const secs = await this.prisma.db.secretaria.findMany({ select: { id: true, nome: true } });
    return new Map(secs.map((s) => [s.id, s.nome]));
  }

  /** Nome do município (para cabeçalho de relatórios). */
  async municipioNome(): Promise<string> {
    const t = await this.prisma
      .platform()
      .tenant.findUnique({ where: { id: TenantContext.tenantId()! }, select: { nome: true } });
    return t?.nome ?? 'Município';
  }
}

export type RelatorioDados = Awaited<ReturnType<ManifestacoesAdminService['relatorioDados']>>;
