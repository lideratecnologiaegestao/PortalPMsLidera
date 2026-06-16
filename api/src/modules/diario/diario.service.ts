import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { SignatureService } from './signature.service';
import { StorageService } from '../storage/storage.service';
import { JOB_DIARIO_ALERTAS, JOB_DIARIO_PDF, QUEUE_INTEGRACOES } from '../queue/queue.constants';
import { BuscaSyncService } from '../busca/busca-sync.service';

/** Tipos de ato/matéria suportados (rótulo exibido no portal e filtros). */
export const DIARIO_TIPOS: { slug: string; nome: string }[] = [
  { slug: 'lei', nome: 'Lei' },
  { slug: 'decreto', nome: 'Decreto' },
  { slug: 'portaria', nome: 'Portaria' },
  { slug: 'resolucao', nome: 'Resolução' },
  { slug: 'edital', nome: 'Edital' },
  { slug: 'licitacao', nome: 'Licitação' },
  { slug: 'extrato_contrato', nome: 'Extrato de Contrato/Convênio' },
  { slug: 'ato_pessoal', nome: 'Ato de Pessoal' },
  { slug: 'aviso', nome: 'Aviso/Comunicado' },
  { slug: 'outro', nome: 'Outro' },
];
const TIPOS_VALIDOS = new Set(DIARIO_TIPOS.map((t) => t.slug));

export interface NovaEdicao {
  numero?: string; // se ausente, numeração automática sequencial
  dataEdicao: string; // AAAA-MM-DD
  titulo: string;
  conteudo?: string;
  tipoEdicao?: string; // ordinaria | extra | suplementar
  suplementoDeId?: string;
}

export interface DadosMateria {
  tipo?: string;
  numeroAto?: string;
  titulo: string;
  ementa?: string;
  conteudo?: string;
  orgaoNome?: string;
  secretariaId?: string;
  ordem?: number;
  retificaMateriaId?: string;
}

type MateriaHash = {
  tipo: string;
  numeroAto: string | null;
  titulo: string;
  ementa: string | null;
  conteudo: string;
  ordem: number;
  id: string;
};

/**
 * Diário Oficial. Fluxo: rascunho → (publicar) assina + carimba + congela.
 * O hash é SHA-256 do conteúdo canônico; a imutabilidade após publicação é
 * garantida no banco (trigger). A verificação pública recalcula o hash e
 * confere a assinatura — detecta adulteração.
 */
@Injectable()
export class DiarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signature: SignatureService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_INTEGRACOES) private readonly fila: Queue,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  /** Busca o PDF de uma edição publicada para download (público). */
  async pdfDaEdicao(numero: string): Promise<{ buffer: Buffer; filename: string }> {
    const ed = await this.prisma.db.diarioEdicao.findFirst({
      where: { numero, status: 'publicado' },
      select: { numero: true, arquivoKey: true },
    });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (!ed.arquivoKey) throw new NotFoundException('PDF ainda não disponível — em geração.');
    const { buffer } = await this.storage.get(ed.arquivoKey);
    return { buffer, filename: `diario-${ed.numero}.pdf` };
  }

  /** Enfileira a geração assíncrona do PDF da edição (idempotente por jobId). */
  private async enfileirarPdf(tenantId: string, edicaoId: string) {
    await this.fila.add(
      JOB_DIARIO_PDF,
      { tenantId, edicaoId },
      { jobId: `diario-pdf-${edicaoId}`, attempts: 3, backoff: { type: 'exponential', delay: 8000 } },
    );
  }

  /** (Re)gera o PDF de uma edição publicada (admin). */
  async regerarPdf(id: string) {
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'publicado') {
      throw new BadRequestException('O PDF só é gerado para edições publicadas.');
    }
    await this.fila.remove(`diario-pdf-${id}`).catch(() => undefined);
    await this.enfileirarPdf(ed.tenantId, id);
    return { enfileirado: true };
  }

  /**
   * String canônica determinística que entra no hash. Inclui as matérias
   * (ordenadas) quando houver — assim a integridade cobre TODO o conteúdo
   * publicado. Para edições sem matérias o resultado é idêntico ao formato
   * legado (compatibilidade retroativa com edições já publicadas).
   */
  private canonical(
    e: { numero: string; dataEdicao: Date; titulo: string; conteudo: string },
    materias: MateriaHash[] = [],
  ): string {
    const data = e.dataEdicao.toISOString().slice(0, 10);
    const base = [e.numero, data, e.titulo, e.conteudo].join('\n');
    if (!materias.length) return base;
    const ordenadas = [...materias].sort(
      (a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id),
    );
    const mat = ordenadas
      .map((m) =>
        [m.tipo, m.numeroAto ?? '', m.titulo, m.ementa ?? '', m.conteudo].join('\n'),
      )
      .join('\n');
    return base + '\n' + mat;
  }

  private calcHash(
    e: { numero: string; dataEdicao: Date; titulo: string; conteudo: string },
    materias: MateriaHash[] = [],
  ): string {
    return createHash('sha256').update(this.canonical(e, materias)).digest('hex');
  }

  /** Carrega as matérias de uma edição na ordem canônica. */
  private materiasDe(edicaoId: string): Promise<MateriaHash[]> {
    return this.prisma.db.diarioMateria.findMany({
      where: { edicaoId },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
      select: {
        id: true,
        tipo: true,
        numeroAto: true,
        titulo: true,
        ementa: true,
        conteudo: true,
        ordem: true,
      },
    }) as Promise<MateriaHash[]>;
  }

  async criarRascunho(dto: NovaEdicao) {
    const tenantId = TenantContext.tenantId()!;

    // Numeração: usa a informada; senão gera a próxima sequencial (numero_seq).
    const ultima = await this.prisma.db.diarioEdicao.findFirst({
      where: { numeroSeq: { not: null } },
      orderBy: { numeroSeq: 'desc' },
      select: { numeroSeq: true },
    });
    const proximoSeq = (ultima?.numeroSeq ?? 0) + 1;
    const numero = (dto.numero ?? String(proximoSeq)).trim();
    // numeroSeq só quando o número for puramente numérico (mantém a sequência).
    const numeroSeq = /^\d+$/.test(numero) ? Number(numero) : proximoSeq;

    const tipoEdicao = ['ordinaria', 'extra', 'suplementar'].includes(
      dto.tipoEdicao ?? '',
    )
      ? dto.tipoEdicao!
      : 'ordinaria';

    return this.prisma.db.diarioEdicao.create({
      data: {
        tenantId,
        numero,
        numeroSeq,
        tipoEdicao,
        suplementoDeId: dto.suplementoDeId || null,
        dataEdicao: new Date(dto.dataEdicao),
        titulo: dto.titulo,
        conteudo: dto.conteudo ?? '',
      },
    });
  }

  /** Assina, carimba e congela a edição (passa a ser imutável). */
  async publicar(id: string) {
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'rascunho') {
      throw new BadRequestException('Apenas rascunhos podem ser publicados.');
    }

    const materias = await this.materiasDe(id);
    const hash = this.calcHash(ed, materias);
    const { assinatura, algoritmo, carimboTempo } = this.signature.assinar(hash);

    const publicada = await this.prisma.db.diarioEdicao.update({
      where: { id },
      data: {
        status: 'publicado',
        hash,
        assinatura,
        algoritmo,
        carimboTempo,
        publicadoEm: new Date(),
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId: ed.tenantId,
        atorId: TenantContext.get().userId ?? null,
        acao: 'DIARIO_PUBLICADO',
        entidade: 'diario_edicao',
        entidadeId: id,
        dados: { numero: ed.numero, hash },
      },
    });

    // Gera o PDF e dispara os alertas por termo em segundo plano (não bloqueia).
    await this.enfileirarPdf(ed.tenantId, id).catch((e) =>
      this.prisma.db.auditLog.create({
        data: {
          tenantId: ed.tenantId, acao: 'DIARIO_PDF_ENFILEIRAR_FALHOU',
          entidade: 'diario_edicoes', entidadeId: id, dados: { erro: String(e) },
        },
      }).catch(() => undefined),
    );
    await this.fila
      .add(JOB_DIARIO_ALERTAS, { tenantId: ed.tenantId, edicaoId: id }, {
        jobId: `diario-alertas-${id}`, attempts: 3, backoff: { type: 'exponential', delay: 10000 },
      })
      .catch(() => undefined);

    // Indexa as matérias desta edição no buscador unificado (fire-and-forget).
    // Reusa o `materias` já carregado acima (this.materiasDe(id)).
    for (const m of materias) {
      this.buscaSync.enqueue('diario', m.id).catch(() => undefined);
    }

    return publicada;
  }

  /**
   * Edição publicada por número (público) + sumário (matérias por órgão/ordem)
   * + checagem de integridade (hash recalculado sobre edição + matérias).
   */
  async porNumero(numero: string) {
    const ed = await this.prisma.db.diarioEdicao.findFirst({
      where: { numero, status: 'publicado' },
    });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    const materias = await this.prisma.db.diarioMateria.findMany({
      where: { edicaoId: ed.id },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
      select: {
        id: true, tipo: true, numeroAto: true, titulo: true, ementa: true,
        conteudo: true, ordem: true, orgaoNome: true, paginaInicial: true,
        secretaria: { select: { nome: true, slug: true } },
      },
    });
    return { ...ed, materias, integridade: this.integridade(ed, materias as MateriaHash[]) };
  }

  /** Verificação pública de autenticidade por hash. */
  async verificar(hash: string) {
    if (!hash) throw new BadRequestException('Informe o hash.');
    const ed = await this.prisma.db.diarioEdicao.findFirst({
      where: { hash, status: 'publicado' },
    });
    if (!ed) {
      return { valido: false, motivo: 'Hash não corresponde a nenhuma edição publicada.' };
    }
    const materias = await this.materiasDe(ed.id);
    const { hashConfere, assinaturaConfere } = this.integridade(ed, materias);
    return {
      valido: hashConfere && assinaturaConfere,
      numero: ed.numero,
      dataEdicao: ed.dataEdicao,
      publicadoEm: ed.publicadoEm,
      carimboTempo: ed.carimboTempo,
      algoritmo: ed.algoritmo,
      hashConfere,
      assinaturaConfere,
    };
  }

  // --------------------------------------------------------------- admin
  /** Lista edições com filtro de status e paginação (admin). */
  async listarAdmin(opts: {
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;

    const [items, total] = await Promise.all([
      this.prisma.db.diarioEdicao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          numero: true,
          dataEdicao: true,
          titulo: true,
          status: true,
          publicadoEm: true,
          criadoEm: true,
        },
      }),
      this.prisma.db.diarioEdicao.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /** Detalhe de edição por ID (admin). */
  async buscarAdmin(id: string) {
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    return ed;
  }

  /** Edita edição SOMENTE se estiver em rascunho. */
  async editarRascunho(
    id: string,
    dto: Partial<NovaEdicao>,
    atorId?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'rascunho') {
      throw new ConflictException(
        'Apenas rascunhos podem ser editados. Edições publicadas são imutáveis.',
      );
    }

    const data: Record<string, unknown> = {};
    if (dto.numero !== undefined) data.numero = dto.numero;
    if (dto.dataEdicao !== undefined) data.dataEdicao = new Date(dto.dataEdicao);
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.conteudo !== undefined) data.conteudo = dto.conteudo;

    const atualizada = await this.prisma.db.diarioEdicao.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'DIARIO_RASCUNHO_EDITADO',
        entidade: 'diario_edicoes',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizada;
  }

  /** Revoga uma edição publicada. */
  async revogar(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'publicado') {
      throw new ConflictException('Apenas edições publicadas podem ser revogadas.');
    }

    const revogada = await this.prisma.db.diarioEdicao.update({
      where: { id },
      data: { status: 'revogado' },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'DIARIO_REVOGADO',
        entidade: 'diario_edicoes',
        entidadeId: id,
        dados: { numero: ed.numero },
      },
    });

    return revogada;
  }

  /** Exclui edição SOMENTE se for rascunho. */
  async excluirRascunho(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'rascunho') {
      throw new ConflictException('Apenas rascunhos podem ser excluídos.');
    }

    await this.prisma.db.diarioEdicao.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'DIARIO_RASCUNHO_EXCLUIDO',
        entidade: 'diario_edicoes',
        entidadeId: id,
        dados: { numero: ed.numero },
      },
    });

    return { excluido: true };
  }

  // recalcula o hash do conteúdo gravado (edição + matérias) e confere a assinatura
  private integridade(
    ed: {
      numero: string;
      dataEdicao: Date;
      titulo: string;
      conteudo: string;
      hash: string | null;
      assinatura: string | null;
    },
    materias: MateriaHash[] = [],
  ) {
    const recalculado = this.calcHash(ed, materias);
    const hashConfere = !!ed.hash && recalculado === ed.hash;
    const assinaturaConfere =
      !!ed.hash && !!ed.assinatura && this.signature.conferir(ed.hash, ed.assinatura);
    return { hashConfere, assinaturaConfere };
  }

  // ============================================================ matérias (admin)

  private async edicaoRascunho(edicaoId: string) {
    const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id: edicaoId } });
    if (!ed) throw new NotFoundException('Edição não encontrada.');
    if (ed.status !== 'rascunho') {
      throw new ConflictException(
        'Só é possível alterar matérias enquanto a edição está em rascunho. Edições publicadas são imutáveis.',
      );
    }
    return ed;
  }

  private normalizarTipo(tipo?: string): string {
    return tipo && TIPOS_VALIDOS.has(tipo) ? tipo : 'outro';
  }

  /** Lista matérias de uma edição (admin). */
  listarMaterias(edicaoId: string) {
    return this.prisma.db.diarioMateria.findMany({
      where: { edicaoId },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
      include: { secretaria: { select: { nome: true } } },
    });
  }

  /** Adiciona matéria a uma edição em rascunho. */
  async adicionarMateria(edicaoId: string, dto: DadosMateria) {
    await this.edicaoRascunho(edicaoId);
    const tenantId = TenantContext.tenantId()!;
    if (!dto.titulo?.trim()) throw new BadRequestException('Informe o título da matéria.');
    const materia = await this.prisma.db.diarioMateria.create({
      data: {
        tenantId,
        edicaoId,
        tipo: this.normalizarTipo(dto.tipo),
        numeroAto: dto.numeroAto?.trim() || null,
        titulo: dto.titulo.trim(),
        ementa: dto.ementa?.trim() || null,
        conteudo: dto.conteudo ?? '',
        orgaoNome: dto.orgaoNome?.trim() || null,
        secretariaId: dto.secretariaId || null,
        ordem: dto.ordem ?? 0,
        retificaMateriaId: dto.retificaMateriaId || null,
      },
    });
    // Indexação só se a edição já estiver publicada (rascunhos não entram no índice)
    this.buscaSync.enqueue('diario', materia.id).catch(() => undefined);
    return materia;
  }

  /** Atualiza matéria (só se a edição ainda for rascunho). */
  async atualizarMateria(materiaId: string, dto: DadosMateria) {
    const m = await this.prisma.db.diarioMateria.findUnique({ where: { id: materiaId } });
    if (!m) throw new NotFoundException('Matéria não encontrada.');
    await this.edicaoRascunho(m.edicaoId);
    const data: Record<string, unknown> = {};
    if (dto.tipo !== undefined) data.tipo = this.normalizarTipo(dto.tipo);
    if (dto.numeroAto !== undefined) data.numeroAto = dto.numeroAto?.trim() || null;
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.ementa !== undefined) data.ementa = dto.ementa?.trim() || null;
    if (dto.conteudo !== undefined) data.conteudo = dto.conteudo ?? '';
    if (dto.orgaoNome !== undefined) data.orgaoNome = dto.orgaoNome?.trim() || null;
    if (dto.secretariaId !== undefined) data.secretariaId = dto.secretariaId || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    if (dto.retificaMateriaId !== undefined) data.retificaMateriaId = dto.retificaMateriaId || null;
    const atualizada = await this.prisma.db.diarioMateria.update({ where: { id: materiaId }, data });
    this.buscaSync.enqueue('diario', materiaId).catch(() => undefined);
    return atualizada;
  }

  /** Exclui matéria (só se a edição ainda for rascunho). */
  async excluirMateria(materiaId: string) {
    const m = await this.prisma.db.diarioMateria.findUnique({ where: { id: materiaId } });
    if (!m) throw new NotFoundException('Matéria não encontrada.');
    await this.edicaoRascunho(m.edicaoId);
    await this.prisma.db.diarioMateria.delete({ where: { id: materiaId } });
    this.buscaSync.enqueue('diario', materiaId).catch(() => undefined);
    return { excluido: true };
  }

  // ============================================================ público (arquivo/busca)

  /** Tipos de matéria disponíveis (para filtros do portal). */
  tipos() {
    return DIARIO_TIPOS;
  }

  /**
   * Arquivo histórico de edições publicadas, com filtros por ano/mês/tipo e
   * paginação. Inclui a contagem de matérias de cada edição.
   */
  async arquivo(opts: {
    ano?: number;
    mes?: number;
    tipoEdicao?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.DiarioEdicaoWhereInput = { status: 'publicado' };
    if (opts.tipoEdicao) where.tipoEdicao = opts.tipoEdicao;
    if (opts.ano) {
      const ini = new Date(Date.UTC(opts.ano, (opts.mes ?? 1) - 1, 1));
      const fim = opts.mes
        ? new Date(Date.UTC(opts.ano, opts.mes, 1))
        : new Date(Date.UTC(opts.ano + 1, 0, 1));
      where.dataEdicao = { gte: ini, lt: fim };
    }
    const [items, total] = await Promise.all([
      this.prisma.db.diarioEdicao.findMany({
        where,
        orderBy: { dataEdicao: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true, numero: true, dataEdicao: true, titulo: true,
          tipoEdicao: true, publicadoEm: true, totalPaginas: true,
          _count: { select: { materias: true } },
        },
      }),
      this.prisma.db.diarioEdicao.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /** Anos com edições publicadas (para o navegador do arquivo). */
  async anosDisponiveis(): Promise<number[]> {
    const rows = await this.prisma.tx((t) =>
      t.$queryRaw<{ ano: number }[]>`
        SELECT DISTINCT EXTRACT(YEAR FROM data_edicao)::int AS ano
        FROM diario_edicoes WHERE status = 'publicado' ORDER BY ano DESC`,
    );
    return rows.map((r) => r.ano);
  }

  /**
   * Busca full-text (português) nas matérias de edições publicadas. Retorna a
   * matéria, sua edição e um trecho com o termo destacado (<mark>). Roda dentro
   * de `prisma.tx` para garantir o GUC de tenant (RLS) na query raw.
   */
  async buscar(opts: {
    q?: string;
    tipo?: string;
    orgao?: string;
    de?: string;
    ate?: string;
    page: number;
    pageSize: number;
  }) {
    const { q, tipo, orgao, de, ate, page, pageSize } = opts;
    const offset = (page - 1) * pageSize;
    const temQ = !!q && q.trim().length > 0;

    return this.prisma.tx(async (t) => {
      const conds: Prisma.Sql[] = [Prisma.sql`e.status = 'publicado'`];
      if (temQ) conds.push(Prisma.sql`m.busca @@ websearch_to_tsquery('portuguese', ${q})`);
      if (tipo) conds.push(Prisma.sql`m.tipo = ${tipo}`);
      if (orgao) conds.push(Prisma.sql`COALESCE(s.nome, m.orgao_nome) ILIKE ${'%' + orgao + '%'}`);
      if (de) conds.push(Prisma.sql`e.data_edicao >= ${de}::date`);
      if (ate) conds.push(Prisma.sql`e.data_edicao <= ${ate}::date`);
      const where = Prisma.join(conds, ' AND ');

      const snippet = temQ
        ? Prisma.sql`ts_headline('portuguese',
            regexp_replace(COALESCE(m.ementa,'') || ' ' || COALESCE(m.conteudo,''), '<[^>]+>', ' ', 'g'),
            websearch_to_tsquery('portuguese', ${q}),
            'MaxWords=45, MinWords=18, StartSel=<mark>, StopSel=</mark>, MaxFragments=2')`
        : Prisma.sql`left(regexp_replace(COALESCE(m.ementa,''), '<[^>]+>', ' ', 'g'), 220)`;
      const ordem = temQ
        ? Prisma.sql`ts_rank(m.busca, websearch_to_tsquery('portuguese', ${q})) DESC, e.data_edicao DESC`
        : Prisma.sql`e.data_edicao DESC, m.ordem ASC`;

      const [rows, totalRows] = await Promise.all([
        t.$queryRaw<any[]>`
          SELECT m.id, m.tipo, m.numero_ato AS "numeroAto", m.titulo,
                 COALESCE(s.nome, m.orgao_nome) AS "orgao",
                 e.id AS "edicaoId", e.numero AS "edicaoNumero", e.data_edicao AS "dataEdicao",
                 ${snippet} AS snippet
          FROM diario_materias m
          JOIN diario_edicoes e ON e.id = m.edicao_id
          LEFT JOIN secretarias s ON s.id = m.secretaria_id
          WHERE ${where}
          ORDER BY ${ordem}
          LIMIT ${pageSize} OFFSET ${offset}`,
        t.$queryRaw<{ total: bigint }[]>`
          SELECT COUNT(*)::bigint AS total
          FROM diario_materias m
          JOIN diario_edicoes e ON e.id = m.edicao_id
          LEFT JOIN secretarias s ON s.id = m.secretaria_id
          WHERE ${where}`,
      ]);
      const total = Number(totalRows[0]?.total ?? 0);
      return { items: rows, total, page, pageSize };
    });
  }

  /** Dados abertos (JSON) das matérias de edições publicadas. Licença CC BY 4.0. */
  async dadosAbertos() {
    const materias = await this.prisma.db.diarioMateria.findMany({
      where: { edicao: { status: 'publicado' } },
      orderBy: { criadoEm: 'desc' },
      take: 500,
      select: {
        id: true, tipo: true, numeroAto: true, titulo: true, ementa: true, orgaoNome: true,
        secretaria: { select: { nome: true } },
        edicao: { select: { numero: true, dataEdicao: true } },
      },
    });
    return {
      licenca: 'CC BY 4.0',
      fonte: 'Diário Oficial Eletrônico',
      atualizadoEm: new Date().toISOString(),
      total: materias.length,
      materias: materias.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        numeroAto: m.numeroAto,
        titulo: m.titulo,
        ementa: m.ementa,
        orgao: m.secretaria?.nome ?? m.orgaoNome ?? null,
        edicao: m.edicao.numero,
        dataEdicao: m.edicao.dataEdicao,
      })),
    };
  }

  /** Feed RSS 2.0 das edições publicadas mais recentes. */
  async rss(host: string): Promise<string> {
    const base = `https://${host}`;
    const eds = await this.prisma.db.diarioEdicao.findMany({
      where: { status: 'publicado' },
      orderBy: { dataEdicao: 'desc' },
      take: 30,
      select: { numero: true, titulo: true, dataEdicao: true, publicadoEm: true },
    });
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const itens = eds
      .map((e) => {
        const link = `${base}/diario/${encodeURIComponent(e.numero)}`;
        const pub = (e.publicadoEm ?? e.dataEdicao).toUTCString();
        return `    <item>
      <title>${esc(e.titulo)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <description>${esc(`Edição nº ${e.numero}`)}</description>
    </item>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Diário Oficial Eletrônico</title>
    <link>${base}/diario</link>
    <description>Edições publicadas do Diário Oficial</description>
    <language>pt-BR</language>
${itens}
  </channel>
</rss>`;
  }

  /** Matéria individual (permalink público) — só se a edição estiver publicada. */
  async materiaPublica(id: string) {
    const m = await this.prisma.db.diarioMateria.findUnique({
      where: { id },
      include: {
        secretaria: { select: { nome: true, slug: true } },
        edicao: {
          select: { id: true, numero: true, dataEdicao: true, status: true, hash: true, publicadoEm: true },
        },
        retifica: { select: { id: true, titulo: true, numeroAto: true } },
      },
    });
    if (!m || m.edicao.status !== 'publicado') {
      throw new NotFoundException('Matéria não encontrada.');
    }
    return m;
  }
}
