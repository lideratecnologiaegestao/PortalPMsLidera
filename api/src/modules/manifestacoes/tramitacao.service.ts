import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ManifestacoesService } from './manifestacoes.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AnexosService } from './anexos.service';
import { eventosValidos } from './state-machine';
import { Canal, Status } from './manifestacao.types';

// Alfabeto sem caracteres ambíguos (I, O, 0, 1) para a chave de acompanhamento.
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Estados em que o cidadão ainda pode interagir / avaliar. */
const ENCERRADOS: Status[] = ['concluida', 'arquivada'];

/**
 * Tramitação do canal cidadão ↔ ouvidor (chat), acompanhamento por protocolo +
 * chave, painel do cidadão, respostas/encaminhamentos do ouvidor, satisfação e
 * estatísticas públicas. Reusa a FSM/SLA via ManifestacoesService.aplicarEvento.
 *
 * LGPD: a consulta anônima exige protocolo + chave (a chave nunca é guardada em
 * claro — só o hash); mensagens internas (ouvidor↔área) nunca vão ao cidadão.
 */
@Injectable()
export class TramitacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manifestacoes: ManifestacoesService,
    private readonly notificacoes: NotificacoesService,
    private readonly anexos: AnexosService,
  ) {}

  private notificar(p: {
    tenantId: string;
    manifestacaoId: string;
    protocolo: string;
    evento: 'cidadao_respondeu' | 'resposta_publicada' | 'atribuicao';
    destino: 'ouvidores' | 'responsavel' | 'cidadao' | { userId: string };
  }) {
    return this.notificacoes.enfileirar(p).catch(() => undefined);
  }

  // ---------------------------------------------------------------- chave
  static gerarChave(): string {
    let s = '';
    for (let i = 0; i < 10; i++) s += ALFA[randomInt(ALFA.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  }

  static hashChave(chave: string): string {
    const norm = chave.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return createHash('sha256').update(norm).digest('hex');
  }

  // ----------------------------------------------------- acesso/validação
  /**
   * Resolve a manifestação garantindo que o requisitante pode vê-la:
   * dono logado (cidadaoId === userId) OU chave de acompanhamento correta.
   */
  private async autorizar(protocolo: string, chave?: string) {
    const m = await this.prisma.db.manifestacao.findFirst({
      where: { protocolo },
    });
    if (!m) throw new NotFoundException('Protocolo não encontrado.');

    const userId = TenantContext.get().userId;
    const ehDono = !!userId && m.cidadaoId === userId;
    const chaveOk =
      !!chave && !!m.chaveHash && TramitacaoService.hashChave(chave) === m.chaveHash;

    if (!ehDono && !chaveOk) {
      throw new ForbiddenException('Protocolo ou chave de acompanhamento inválidos.');
    }
    return m;
  }

  // ------------------------------------------------------- acompanhamento
  async acompanhar(protocolo: string, chave?: string) {
    const m = await this.autorizar(protocolo, chave);
    return this.montarDetalhePublico(m.id);
  }

  /** Painel do cidadão logado: lista suas manifestações por canal. */
  async minhas(canal?: string) {
    const userId = TenantContext.get().userId;
    if (!userId) throw new ForbiddenException('Autenticação necessária.');

    const where: Record<string, unknown> = { cidadaoId: userId };
    if (canal) where.canal = canal;

    const rows = await this.prisma.db.manifestacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        protocolo: true,
        canal: true,
        tipo: true,
        status: true,
        assunto: true,
        prazoEm: true,
        prorrogado: true,
        respondidoEm: true,
        criadoEm: true,
      },
    });
    return rows;
  }

  // ------------------------------------------------- mensagens do cidadão
  async mensagemCidadao(protocolo: string, chave: string | undefined, conteudo: string) {
    const texto = (conteudo ?? '').trim();
    if (!texto) throw new BadRequestException('A mensagem não pode ser vazia.');
    if (texto.length > 5000) throw new BadRequestException('Mensagem muito longa.');

    const m = await this.autorizar(protocolo, chave);
    if (ENCERRADOS.includes(m.status as Status)) {
      throw new BadRequestException('Esta manifestação já foi encerrada.');
    }

    await this.prisma.db.manifestacaoMensagem.create({
      data: {
        tenantId: m.tenantId,
        manifestacaoId: m.id,
        autorTipo: 'cidadao',
        autorId: m.cidadaoId ?? undefined,
        conteudo: texto,
        interno: false,
      },
    });

    // Se aguardava complemento do cidadão, a resposta RETOMA o SLA.
    if (m.status === 'aguardando_cidadao') {
      await this.manifestacoes.aplicarEvento(m.id, 'retomar', {
        observacao: 'Cidadão respondeu (retomada automática).',
      });
    }

    // Notifica o responsável (ou os ouvidores, se ainda não atribuída).
    this.notificar({
      tenantId: m.tenantId,
      manifestacaoId: m.id,
      protocolo: m.protocolo,
      evento: 'cidadao_respondeu',
      destino: m.responsavelId ? 'responsavel' : 'ouvidores',
    });

    return this.montarDetalhePublico(m.id);
  }

  /** Pesquisa de satisfação (Lei 13.460), uma vez, após resposta/conclusão. */
  async avaliar(
    protocolo: string,
    chave: string | undefined,
    nota: number,
    comentario?: string,
  ) {
    const m = await this.autorizar(protocolo, chave);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      throw new BadRequestException('Nota deve ser de 1 a 5.');
    }
    const respondida = ['respondida', 'parcialmente_atendida', 'concluida'].includes(m.status);
    if (!respondida) {
      throw new BadRequestException('A avaliação fica disponível após a resposta.');
    }
    await this.prisma.db.pesquisaSatisfacao.upsert({
      where: { manifestacaoId: m.id },
      create: {
        tenantId: m.tenantId,
        manifestacaoId: m.id,
        nota,
        comentario: comentario?.trim() || null,
      },
      update: { nota, comentario: comentario?.trim() || null },
    });
    return { ok: true };
  }

  // ------------------------------------------------- anexos do cidadão
  async anexoCidadao(protocolo: string, chave: string | undefined, file: any) {
    const m = await this.autorizar(protocolo, chave);
    if (ENCERRADOS.includes(m.status as Status)) {
      throw new BadRequestException('Esta manifestação já foi encerrada.');
    }
    const anexo = await this.anexos.upload(m.id, file, 'cidadao');
    await this.prisma.db.manifestacaoMensagem.create({
      data: {
        tenantId: m.tenantId,
        manifestacaoId: m.id,
        autorTipo: 'cidadao',
        autorId: m.cidadaoId ?? undefined,
        conteudo: `📎 Anexei o arquivo: ${anexo.nomeArquivo}`,
        interno: false,
      },
    });
    return this.montarDetalhePublico(m.id);
  }

  /** Stream de um anexo para o cidadão (valida protocolo+chave e o vínculo). */
  async anexoStreamCidadao(protocolo: string, chave: string | undefined, anexoId: string) {
    const m = await this.autorizar(protocolo, chave);
    return this.anexos.stream(anexoId, m.id);
  }

  // ----------------------------------------------- recurso e-SIC (cidadão)
  async recursoCidadao(protocolo: string, chave: string | undefined, justificativa: string) {
    const texto = (justificativa ?? '').trim();
    if (!texto) throw new BadRequestException('Descreva a justificativa do recurso.');

    const m = await this.autorizar(protocolo, chave);
    if (m.canal !== 'esic') {
      throw new BadRequestException('Recurso só se aplica a pedidos de acesso à informação (e-SIC).');
    }

    const validos = await this.manifestacoes.acoesDisponiveis(m.id);
    const evento = validos.includes('abrir_recurso_1a')
      ? 'abrir_recurso_1a'
      : validos.includes('abrir_recurso_2a')
      ? 'abrir_recurso_2a'
      : null;
    if (!evento) throw new BadRequestException('Não há recurso disponível para este pedido no momento.');

    await this.prisma.db.manifestacaoMensagem.create({
      data: {
        tenantId: m.tenantId,
        manifestacaoId: m.id,
        autorTipo: 'cidadao',
        autorId: m.cidadaoId ?? undefined,
        conteudo: `Recurso (${evento === 'abrir_recurso_1a' ? '1ª' : '2ª'} instância): ${texto}`,
        interno: false,
      },
    });
    await this.manifestacoes.aplicarEvento(m.id, evento as any, { observacao: texto });

    // notifica a ouvidoria/autoridade superior
    this.notificacoes
      .enfileirar({
        tenantId: m.tenantId,
        manifestacaoId: m.id,
        protocolo: m.protocolo,
        evento: 'cidadao_respondeu',
        destino: 'ouvidores',
      })
      .catch(() => undefined);

    return this.montarDetalhePublico(m.id);
  }

  // ----------------------------------------------- ações internas (staff)
  /** Lista a tramitação completa para o painel interno (inclui mensagens internas). */
  async tramitacaoInterna(manifestacaoId: string) {
    const m = await this.prisma.db.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');
    const [mensagens, eventos, anexos] = await Promise.all([
      this.prisma.db.manifestacaoMensagem.findMany({
        where: { manifestacaoId },
        orderBy: { criadoEm: 'asc' },
      }),
      this.prisma.db.manifestacaoEvento.findMany({
        where: { manifestacaoId },
        orderBy: { criadoEm: 'asc' },
      }),
      this.anexos.listar(manifestacaoId),
    ]);
    return {
      mensagens,
      anexos,
      eventos: eventos.map((e) => ({ ...e, id: String(e.id) })),
    };
  }

  /**
   * Mensagem do servidor/ouvidor. `interno=true` → tramitação interna
   * (ouvidor↔área), invisível ao cidadão. `interno=false` → visível ao cidadão.
   */
  async mensagemServidor(
    manifestacaoId: string,
    conteudo: string,
    opts: { interno: boolean; atorId?: string; autorNome?: string },
  ) {
    const texto = (conteudo ?? '').trim();
    if (!texto) throw new BadRequestException('A mensagem não pode ser vazia.');
    const m = await this.prisma.db.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    return this.prisma.db.manifestacaoMensagem.create({
      data: {
        tenantId: m.tenantId,
        manifestacaoId,
        autorTipo: 'servidor',
        autorId: opts.atorId,
        autorNome: opts.interno ? opts.autorNome ?? 'Área interna' : 'Ouvidoria',
        conteudo: texto,
        interno: opts.interno,
      },
    });
  }

  /**
   * Responder ao cidadão: grava a resposta oficial, publica a mensagem visível
   * e aplica a transição `responder` (encerra o SLA).
   */
  async responder(manifestacaoId: string, conteudo: string, atorId?: string) {
    const texto = (conteudo ?? '').trim();
    if (!texto) throw new BadRequestException('A resposta não pode ser vazia.');
    const m = await this.prisma.db.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    await this.prisma.db.manifestacao.update({
      where: { id: manifestacaoId },
      data: { resposta: texto },
    });
    await this.mensagemServidor(manifestacaoId, texto, { interno: false, atorId });
    const r = await this.manifestacoes.aplicarEvento(manifestacaoId, 'responder', {
      atorId,
      observacao: 'Resposta publicada ao cidadão.',
    });
    // Notifica o cidadão (usuário logado ou e-mail informado).
    this.notificar({
      tenantId: m.tenantId,
      manifestacaoId,
      protocolo: m.protocolo,
      evento: 'resposta_publicada',
      destino: 'cidadao',
    });
    return r;
  }

  /**
   * Encaminhar à área: atribui secretaria/responsável, registra a tramitação
   * interna e aplica a transição `encaminhar_area`.
   */
  async encaminhar(
    manifestacaoId: string,
    dados: { secretariaId?: string; responsavelId?: string; observacao?: string },
    atorId?: string,
  ) {
    const m = await this.prisma.db.manifestacao.findUnique({ where: { id: manifestacaoId } });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const data: Record<string, unknown> = {};
    if (dados.secretariaId) data.secretariaId = dados.secretariaId;
    if (dados.responsavelId) data.responsavelId = dados.responsavelId;
    if (Object.keys(data).length) {
      await this.prisma.db.manifestacao.update({ where: { id: manifestacaoId }, data: data as any });
    }
    if (dados.observacao) {
      await this.mensagemServidor(manifestacaoId, dados.observacao, {
        interno: true,
        atorId,
        autorNome: 'Ouvidoria',
      });
    }
    // Notifica o responsável designado (cai na fila "Minhas atribuições").
    if (dados.responsavelId) {
      this.notificar({
        tenantId: m.tenantId,
        manifestacaoId,
        protocolo: m.protocolo,
        evento: 'atribuicao',
        destino: { userId: dados.responsavelId },
      });
    }
    // só transiciona se a FSM permitir a partir do estado atual
    if (m.status === 'em_analise') {
      return this.manifestacoes.aplicarEvento(manifestacaoId, 'encaminhar_area', {
        atorId,
        observacao: dados.observacao,
      });
    }
    return this.prisma.db.manifestacao.findUnique({ where: { id: manifestacaoId } });
  }

  // ----------------------------------------------------------- helpers
  private async montarDetalhePublico(manifestacaoId: string) {
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id: manifestacaoId },
      include: {
        mensagens: { where: { interno: false }, orderBy: { criadoEm: 'asc' } },
        eventos: { orderBy: { criadoEm: 'asc' } },
        satisfacao: true,
      },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const anexos = await this.anexos.listar(m.id);
    const validos = eventosValidos(m.status as Status, m.canal as Canal);
    const recursoDisponivel =
      m.canal === 'esic' &&
      (validos.includes('abrir_recurso_1a') || validos.includes('abrir_recurso_2a'));

    return {
      id: m.id,
      protocolo: m.protocolo,
      canal: m.canal,
      tipo: m.tipo,
      status: m.status,
      assunto: m.assunto,
      descricao: m.descricao,
      anonima: m.anonima,
      prazoEm: m.prazoEm,
      prorrogado: m.prorrogado,
      respondidoEm: m.respondidoEm,
      resposta: m.resposta,
      criadoEm: m.criadoEm,
      anexos,
      recursoDisponivel,
      podeAvaliar:
        ['respondida', 'parcialmente_atendida', 'concluida'].includes(m.status) && !m.satisfacao,
      satisfacao: m.satisfacao ? { nota: m.satisfacao.nota } : null,
      // marcos públicos da linha do tempo (sem identidade do ator)
      eventos: m.eventos.map((e) => ({
        id: String(e.id),
        evento: e.evento,
        paraStatus: e.paraStatus,
        observacao: e.observacao,
        criadoEm: e.criadoEm,
      })),
      mensagens: m.mensagens.map((msg) => ({
        id: msg.id,
        autorTipo: msg.autorTipo,
        autorNome: msg.autorTipo === 'cidadao' ? 'Você' : msg.autorNome ?? 'Ouvidoria',
        conteudo: msg.conteudo,
        criadoEm: msg.criadoEm,
      })),
    };
  }

  // -------------------------------------------------- estatísticas públicas
  /**
   * Indicadores agregados (sem dado pessoal) para a home e para o relatório da
   * Lei 13.460 / LAI. Tudo escopado por tenant via RLS.
   */
  async estatisticas() {
    const db = this.prisma.db;

    const [porCanal, porStatus, total, serie, tempo, prazo] = await Promise.all([
      db.manifestacao.groupBy({ by: ['canal'], _count: { _all: true } }),
      db.manifestacao.groupBy({ by: ['status'], _count: { _all: true } }),
      db.manifestacao.count(),
      db.$queryRaw<{ mes: string; registradas: bigint; concluidas: bigint }[]>`
        SELECT to_char(g.mes, 'YYYY-MM') AS mes,
               count(r.id)               AS registradas,
               count(c.id)               AS concluidas
        FROM generate_series(date_trunc('month', now()) - interval '5 months',
                             date_trunc('month', now()), interval '1 month') AS g(mes)
        LEFT JOIN manifestacoes r ON date_trunc('month', r.criado_em) = g.mes
        LEFT JOIN manifestacoes c ON date_trunc('month', c.respondido_em) = g.mes
        GROUP BY g.mes ORDER BY g.mes`,
      db.$queryRaw<{ dias: number | null }[]>`
        SELECT avg(extract(epoch FROM (respondido_em - criado_em)) / 86400)::float AS dias
        FROM manifestacoes WHERE respondido_em IS NOT NULL`,
      db.$queryRaw<{ no_prazo: bigint; respondidas: bigint }[]>`
        SELECT count(*) FILTER (WHERE respondido_em <= prazo_em) AS no_prazo,
               count(*)                                          AS respondidas
        FROM manifestacoes WHERE respondido_em IS NOT NULL`,
    ]);

    const cnt = (arr: { _count: { _all: number } }[], key: string, val: string) =>
      (arr.find((x: any) => x[key] === val)?._count._all) ?? 0;

    const abertos = porStatus
      .filter((s) => !['respondida', 'concluida', 'arquivada', 'parcialmente_atendida', 'indeferida'].includes(s.status))
      .reduce((a, s) => a + s._count._all, 0);
    const respondidas = Number(prazo[0]?.respondidas ?? 0);
    const noPrazo = Number(prazo[0]?.no_prazo ?? 0);

    return {
      total,
      ouvidoria: cnt(porCanal as any, 'canal', 'ouvidoria'),
      esic: cnt(porCanal as any, 'canal', 'esic'),
      abertos,
      respondidas,
      concluidas: cnt(porStatus as any, 'status', 'concluida'),
      taxaNoPrazo: respondidas ? Math.round((noPrazo / respondidas) * 100) : null,
      tempoMedioDias: tempo[0]?.dias != null ? Math.round(tempo[0].dias * 10) / 10 : null,
      porStatus: porStatus.map((s) => ({ status: s.status, total: s._count._all })),
      serieMensal: serie.map((r) => ({
        mes: r.mes,
        registradas: Number(r.registradas),
        concluidas: Number(r.concluidas),
      })),
    };
  }
}
