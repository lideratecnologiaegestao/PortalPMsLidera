import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { CADASTROS_PADRAO } from './cadastros-padrao';
import { JOB_EXTRAI_TEXTO_DOCUMENTO, QUEUE_IA } from '../queue/queue.constants';
import { BuscaSyncService } from '../busca/busca-sync.service';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const GRUPO_MENU = 'Documentos Oficiais';
const REF_GRUPO = 'documentos_root';

/**
 * Motor único de Cadastro de Documentos. Cada cadastro (Leis, Decretos…) tem
 * slug→rota→item de menu automático; os tipos são a taxonomia (filtros). Os
 * documentos vinculam um arquivo da biblioteca de mídia e contam downloads.
 * RLS por tenant (prisma.db); seeding cross-tenant (prisma.platform()).
 *
 * A) Hierarquia de tipos: DocTipo.parentId (auto-relação TipoHierarquia).
 *    - criarTipo/atualizarTipo aceitam parentId; validações de ciclo em atualizarTipo.
 *    - listarPublico com tipoSlug inclui documentos de todos os tipos DESCENDENTES.
 *
 * B) Nível de acesso por grupo: DocCadastro.visibilidade ('publico'|'restrito').
 *    - Cadastro restrito não aparece no portal público nem gera item de menu.
 *    - Acesso a restrito exige usuário autenticado pertencente a grupo autorizado
 *      (ou role super_admin/admin_prefeitura). Anônimos recebem NotFoundException.
 */
@Injectable()
export class DocumentosService {
  private readonly log = new Logger(DocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    @InjectQueue(QUEUE_IA) private readonly filaIa: Queue,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  /** IDs de documentos cujo CONTEÚDO (texto extraído) casa com a busca (FTS). */
  private async idsPorConteudo(q: string): Promise<string[]> {
    try {
      const rows = await this.prisma.tx((t) =>
        t.$queryRaw<{ id: string }[]>`
          SELECT id FROM documentos
          WHERE busca_conteudo @@ websearch_to_tsquery('portuguese', ${q})
          LIMIT 500`,
      );
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }

  /** Enfileira a extração de texto (FTS) do arquivo do documento. */
  private async indexarConteudo(documentoId: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.filaIa
      .add(JOB_EXTRAI_TEXTO_DOCUMENTO, { tenantId, documentoId }, {
        jobId: `doc-fts-${documentoId}`, attempts: 3, backoff: { type: 'exponential', delay: 10000 },
        // remove ao concluir/falhar p/ que uma reindexação (novo upload) possa reenfileirar o mesmo jobId
        removeOnComplete: true, removeOnFail: true,
      })
      .catch(() => undefined);
  }

  /** Backfill: reenfileira a extração de texto dos documentos com arquivo ainda não indexados. */
  async reindexarConteudo(): Promise<{ enfileirados: number }> {
    const docs = await this.prisma.db.documento.findMany({
      where: { arquivoUrl: { not: null }, conteudoIndexadoEm: null },
      select: { id: true },
    });
    for (const d of docs) await this.indexarConteudo(d.id);
    return { enfileirados: docs.length };
  }

  /**
   * Força a reextração de um documento específico (admin).
   * Zera conteudo_extraido/conteudo_indexado_em e reenfileira com forcar=true.
   * Audita a ação como DOCUMENTO_REEXTRAIR.
   */
  async reextrairDocumento(id: string, atorId?: string): Promise<{ enfileirado: boolean }> {
    const tenantId = TenantContext.tenantId()!;
    const doc = await this.prisma.db.documento.findUnique({
      where: { id },
      select: { id: true, arquivoUrl: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (!doc.arquivoUrl) throw new BadRequestException('Documento sem arquivo para reextração.');

    await this.prisma.db.documento.update({
      where: { id },
      data: { conteudoExtraido: null, conteudoIndexadoEm: null },
    });

    const jobId = `doc-fts-force-${id}-${Date.now()}`;
    await this.filaIa
      .add(JOB_EXTRAI_TEXTO_DOCUMENTO, { tenantId, documentoId: id, forcar: true }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: true,
      })
      .catch(() => undefined);

    await this.audit(tenantId, atorId, 'DOCUMENTO_REEXTRAIR', 'documentos', id, { forcar: true });
    return { enfileirado: true };
  }

  /**
   * Backfill: reenfileira TODOS os documentos do tenant que ainda não têm texto
   * extraído (conteudo_extraido nulo ou muito curto) — inclui PDFs escaneados.
   * Throttled: 200 por chamada para não sobrecarregar a fila.
   */
  async reextrairEscaneados(): Promise<{ enfileirados: number }> {
    const LIMITE_POR_CHAMADA = 200;
    const tenantId = TenantContext.tenantId()!;

    // Usa $queryRaw para se beneficiar do idx_documentos_sem_texto (migration 061)
    const docs = await this.prisma.tx((t) =>
      t.$queryRaw<{ id: string }[]>`
        SELECT id FROM documentos
        WHERE arquivo_url IS NOT NULL
          AND (conteudo_extraido IS NULL OR length(coalesce(conteudo_extraido, '')) < 50)
        LIMIT ${LIMITE_POR_CHAMADA}`,
    );

    for (const d of docs) {
      const jobId = `doc-fts-scan-${d.id}`;
      await this.filaIa
        .add(JOB_EXTRAI_TEXTO_DOCUMENTO, { tenantId, documentoId: d.id, forcar: true }, {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 15000 },
          removeOnComplete: true,
          removeOnFail: true,
        })
        .catch(() => undefined);
    }

    await this.audit(tenantId, undefined, 'DOCUMENTOS_REEXTRAIR_ESCANEADOS', 'documentos', tenantId, {
      enfileirados: docs.length,
    });
    return { enfileirados: docs.length };
  }

  // ─────────────────────────────────────────── Helpers de acesso por grupo ──

  /**
   * Retorna o Set de grupoIds dos grupos ATIVOS do usuário no tenant atual.
   * RLS isola automaticamente por tenant.
   */
  private async gruposDoUsuario(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.db.usuarioGrupo.findMany({
      where: { userId, grupo: { ativo: true } },
      select: { grupoId: true },
    });
    return new Set(rows.map((r) => r.grupoId));
  }

  /**
   * Verifica se o contexto atual pode acessar o cadastro dado.
   * - publico → sempre true.
   * - restrito + anônimo → false.
   * - restrito + super_admin/admin_prefeitura → true.
   * - restrito + outros → verifica interseção de grupos.
   */
  private async podeAcessarCadastro(cad: { id: string; visibilidade: string }): Promise<boolean> {
    if (cad.visibilidade === 'publico') return true;

    const ctx = TenantContext.get();
    const userId = ctx.userId;
    const role = ctx.role;

    if (!userId) return false; // anônimo nunca vê restrito

    if (role === 'super_admin' || role === 'admin_prefeitura') return true;

    const gruposPermitidos = await this.prisma.db.docCadastroGrupo.findMany({
      where: { cadastroId: cad.id },
      select: { grupoId: true },
    });
    if (gruposPermitidos.length === 0) return false; // restrito sem grupo → ninguém vê

    const gruposUsuario = await this.gruposDoUsuario(userId);
    return gruposPermitidos.some((g) => gruposUsuario.has(g.grupoId));
  }

  // ──────────────────────────────────────── Helper: descendentes de tipo ──

  /**
   * Retorna [tipoId, ...todos os ids dos tipos descendentes] via BFS em memória.
   * Carrega todos os tipos do cadastro de uma vez para evitar N+1.
   */
  private async descendentesTipo(tipoId: string, cadastroId: string): Promise<string[]> {
    const todos = await this.prisma.db.docTipo.findMany({
      where: { cadastroId },
      select: { id: true, parentId: true },
    });
    // Monta mapa parentId → filhos
    const filhosMap = new Map<string, string[]>();
    for (const t of todos) {
      if (t.parentId) {
        const lista = filhosMap.get(t.parentId) ?? [];
        lista.push(t.id);
        filhosMap.set(t.parentId, lista);
      }
    }
    // BFS
    const resultado: string[] = [tipoId];
    const fila = [tipoId];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      const filhos = filhosMap.get(atual) ?? [];
      for (const f of filhos) {
        resultado.push(f);
        fila.push(f);
      }
    }
    return resultado;
  }

  // ───────────────────────────── Seeding (provisioning/backfill) ───────────
  async semearTenant(tenantId: string): Promise<{ criados: number }> {
    const db = this.prisma.platform();
    let criados = 0;
    const grupoId = await this.menus.acharOuCriarGrupo(tenantId, 'cabecalho', GRUPO_MENU, REF_GRUPO);

    for (const c of CADASTROS_PADRAO) {
      const existe = await db.docCadastro.findFirst({ where: { tenantId, slug: c.slug } });
      if (existe) continue;
      const cad = await db.docCadastro.create({
        data: {
          tenantId, slug: c.slug, nome: c.nome, descricao: c.descricao ?? null,
          icone: c.icone ?? null, ordem: c.ordem, taxonomiaSeed: c.taxonomiaSeed ?? null,
        },
      });
      await db.docTipo.createMany({
        data: c.tipos.map((t, i) => ({
          tenantId, cadastroId: cad.id, codigo: t.codigo ?? null,
          nome: t.nome, slug: t.slug, ordem: i, meta: (t.meta ?? {}) as any,
        })),
      });
      await this.menus.criarItemAuto(tenantId, {
        local: 'cabecalho', parentId: grupoId, label: c.nome, tipo: 'interno',
        href: `/documentos/${c.slug}`, icone: c.icone, refTipo: 'doc_cadastro', refId: cad.id,
      });
      criados++;
    }
    return { criados };
  }

  // ───────────────────────────── Público ───────────────────────────────────

  /**
   * Lista cadastros disponíveis para o contexto atual.
   * - Retorna todos os 'publico' ativos.
   * - Se houver usuário autenticado, inclui também os 'restrito' autorizados.
   * - Inclui campo `visibilidade` no retorno para o front diferenciar.
   */
  async listarCadastros() {
    const publicos = await this.prisma.db.docCadastro.findMany({
      where: { ativo: true, visibilidade: 'publico' },
      orderBy: { ordem: 'asc' },
      select: { slug: true, nome: true, descricao: true, icone: true, visibilidade: true },
    });

    const userId = TenantContext.get().userId;
    if (!userId) return publicos; // anônimo: só públicos

    // Carrega restritos e filtra os autorizados
    const restritos = await this.prisma.db.docCadastro.findMany({
      where: { ativo: true, visibilidade: 'restrito' },
      orderBy: { ordem: 'asc' },
      select: { id: true, slug: true, nome: true, descricao: true, icone: true, visibilidade: true },
    });

    const autorizados: typeof publicos = [];
    for (const r of restritos) {
      if (await this.podeAcessarCadastro(r)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _dropped, ...semId } = r;
        autorizados.push(semId);
      }
    }

    return [...publicos, ...autorizados].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async cadastroPorSlug(slug: string) {
    const cad = await this.prisma.db.docCadastro.findFirst({
      where: { slug, ativo: true },
      select: { id: true, slug: true, nome: true, descricao: true, visibilidade: true },
    });
    if (!cad) throw new NotFoundException('Cadastro não encontrado.');

    if (!(await this.podeAcessarCadastro(cad))) {
      throw new NotFoundException('Cadastro não encontrado.'); // não vaza existência
    }

    const tiposRaw = await this.prisma.db.docTipo.findMany({
      where: { cadastroId: cad.id, ativo: true },
      orderBy: { ordem: 'asc' },
      select: { id: true, slug: true, nome: true, parentId: true },
    });
    // A API pública é slug-orientada (o filtro usa tipoSlug): expõe o pai como
    // SLUG, não UUID, para o front montar a árvore por slug.
    const slugPorId = new Map(tiposRaw.map((t) => [t.id, t.slug]));
    const tipos = tiposRaw.map((t) => ({
      slug: t.slug,
      nome: t.nome,
      parentId: t.parentId ? slugPorId.get(t.parentId) ?? null : null,
    }));
    return { ...cad, tipos };
  }

  async listarPublico(
    cadastroSlug: string,
    p: { tipoSlug?: string; ano?: number; q?: string; page?: number; pageSize?: number },
  ) {
    const cad = await this.prisma.db.docCadastro.findFirst({
      where: { slug: cadastroSlug, ativo: true },
      select: { id: true, visibilidade: true },
    });
    if (!cad) throw new NotFoundException('Cadastro não encontrado.');

    if (!(await this.podeAcessarCadastro(cad))) {
      throw new NotFoundException('Cadastro não encontrado.');
    }

    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, p.pageSize ?? 20));

    let tipoIds: string[] | undefined;
    if (p.tipoSlug) {
      const t = await this.prisma.db.docTipo.findFirst({ where: { cadastroId: cad.id, slug: p.tipoSlug }, select: { id: true } });
      if (t) {
        tipoIds = await this.descendentesTipo(t.id, cad.id);
      }
    }

    const where: any = { cadastroId: cad.id, ativo: true };
    if (tipoIds) where.tipoId = { in: tipoIds };
    if (p.ano) where.ano = p.ano;
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      const ids = await this.idsPorConteudo(q); // busca também no conteúdo do arquivo
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { ementa: { contains: q, mode: 'insensitive' } },
        { numero: { contains: q, mode: 'insensitive' } },
        ...(ids.length ? [{ id: { in: ids } }] : []),
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.db.documento.count({ where }),
      this.prisma.db.documento.findMany({
        where,
        orderBy: [{ ano: 'desc' }, { publicadoEm: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, numero: true, ano: true, dataDocumento: true, titulo: true,
          ementa: true, orgao: true, situacao: true, downloads: true, arquivoUrl: true,
          tipo: { select: { nome: true, slug: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  /** Metadados de todos os documentos de um cadastro (dados abertos / export). */
  async exportarPublico(cadastroSlug: string) {
    const cad = await this.prisma.db.docCadastro.findFirst({
      where: { slug: cadastroSlug, ativo: true },
      select: { id: true, visibilidade: true },
    });
    if (!cad) throw new NotFoundException('Cadastro não encontrado.');

    if (!(await this.podeAcessarCadastro(cad))) {
      throw new NotFoundException('Cadastro não encontrado.');
    }

    const docs = await this.prisma.db.documento.findMany({
      where: { cadastroId: cad.id, ativo: true },
      orderBy: [{ ano: 'desc' }, { publicadoEm: 'desc' }],
      select: { numero: true, ano: true, dataDocumento: true, titulo: true, ementa: true, orgao: true, situacao: true, downloads: true, tipo: { select: { nome: true } } },
    });
    return docs.map((d) => ({
      tipo: d.tipo?.nome ?? '', numero: d.numero ?? '', ano: d.ano ?? '', data: d.dataDocumento,
      titulo: d.titulo, ementa: d.ementa ?? '', orgao: d.orgao ?? '', situacao: d.situacao ?? '', downloads: d.downloads,
    }));
  }

  /**
   * Registra um download (contador) e devolve a URL do arquivo para o redirect.
   * Bloqueia acesso a documentos de cadastros restritos não autorizados.
   */
  async registrarDownload(id: string): Promise<string> {
    try {
      // Carrega documento com dados do cadastro para checar visibilidade
      const docComCadastro = await this.prisma.db.documento.findUnique({
        where: { id },
        select: { arquivoUrl: true, cadastro: { select: { id: true, visibilidade: true } } },
      });
      if (!docComCadastro) throw new NotFoundException('Documento não encontrado.');

      if (!(await this.podeAcessarCadastro(docComCadastro.cadastro))) {
        throw new NotFoundException('Documento não encontrado.');
      }

      const doc = await this.prisma.db.documento.update({
        where: { id },
        data: { downloads: { increment: 1 } },
        select: { arquivoUrl: true },
      });
      if (!doc.arquivoUrl) throw new NotFoundException('Documento sem arquivo.');
      return doc.arquivoUrl;
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException('Documento não encontrado.');
    }
  }

  // ───────────────────────────── Admin: cadastros ──────────────────────────
  async listarCadastrosAdmin() {
    const items = await this.prisma.db.docCadastro.findMany({
      orderBy: { ordem: 'asc' },
      select: {
        id: true, slug: true, nome: true, descricao: true, icone: true, ordem: true, ativo: true,
        visibilidade: true,
        grupos: { select: { grupoId: true } },
        _count: { select: { documentos: true, tipos: true } },
      },
    });
    return items.map((c) => ({
      ...c,
      grupoIds: c.grupos.map((g) => g.grupoId),
      grupos: undefined, // remove o array cru; front usa grupoIds
    }));
  }

  async criarCadastro(
    dto: {
      nome: string;
      descricao?: string;
      icone?: string;
      ordem?: number;
      visibilidade?: 'publico' | 'restrito';
      grupoIds?: string[];
    },
    atorId?: string,
  ) {
    // Validação de visibilidade
    const visibilidade = dto.visibilidade ?? 'publico';
    if (!['publico', 'restrito'].includes(visibilidade)) {
      throw new BadRequestException('visibilidade deve ser "publico" ou "restrito".');
    }
    // Validação de grupoIds
    const grupoIds = dto.grupoIds ?? [];
    this.validarGrupoIds(grupoIds);

    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugUnicoCadastro(slugify(dto.nome), tenantId);
    const cad = await this.prisma.db.docCadastro.create({
      data: {
        tenantId, slug, nome: dto.nome, descricao: dto.descricao ?? null,
        icone: dto.icone ?? 'file', ordem: dto.ordem ?? 99, visibilidade,
      },
    });

    // Menu público só para cadastros públicos
    if (visibilidade === 'publico') {
      const grupoMenuId = await this.menus.acharOuCriarGrupoRls('cabecalho', GRUPO_MENU, REF_GRUPO);
      await this.menus.criarItemAutoRls({
        local: 'cabecalho', parentId: grupoMenuId, label: cad.nome, tipo: 'interno',
        href: `/documentos/${slug}`, icone: cad.icone ?? undefined, refTipo: 'doc_cadastro', refId: cad.id,
      });
    }

    // Grupos de acesso (apenas relevante quando restrito, mas aceito sempre)
    if (grupoIds.length > 0) {
      await this.prisma.db.docCadastroGrupo.createMany({
        data: grupoIds.map((gId) => ({ tenantId, cadastroId: cad.id, grupoId: gId })),
        skipDuplicates: true,
      });
    }

    await this.audit(tenantId, atorId, 'DOC_CADASTRO_CRIADO', 'doc_cadastros', cad.id, { slug, visibilidade, grupoIds });
    return cad;
  }

  async atualizarCadastro(
    id: string,
    dto: {
      nome?: string;
      descricao?: string;
      icone?: string;
      ordem?: number;
      ativo?: boolean;
      visibilidade?: 'publico' | 'restrito';
      grupoIds?: string[];
    },
    atorId?: string,
  ) {
    const tenantId = TenantContext.tenantId()!;

    // Validações de entrada
    if (dto.visibilidade !== undefined && !['publico', 'restrito'].includes(dto.visibilidade)) {
      throw new BadRequestException('visibilidade deve ser "publico" ou "restrito".');
    }
    if (dto.grupoIds !== undefined) {
      this.validarGrupoIds(dto.grupoIds);
    }

    // Estado atual (necessário para lógica de menu ao mudar visibilidade)
    const atual = await this.prisma.db.docCadastro.findUnique({
      where: { id },
      select: { visibilidade: true, slug: true, nome: true, icone: true },
    });
    if (!atual) throw new NotFoundException('Cadastro não encontrado.');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.icone !== undefined) data.icone = dto.icone;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.visibilidade !== undefined) data.visibilidade = dto.visibilidade;

    const cad = await this.prisma.db.docCadastro.update({ where: { id }, data });

    // Lógica de menu por transição de visibilidade
    const novaVisibilidade = dto.visibilidade ?? atual.visibilidade;
    if (dto.visibilidade !== undefined && dto.visibilidade !== atual.visibilidade) {
      if (dto.visibilidade === 'restrito') {
        // Tornou-se restrito: remove do menu público
        await this.menus.removerPorRef('doc_cadastro', id);
      } else if (dto.visibilidade === 'publico') {
        // Tornou-se público: recria item de menu
        const grupoMenuId = await this.menus.acharOuCriarGrupoRls('cabecalho', GRUPO_MENU, REF_GRUPO);
        await this.menus.criarItemAutoRls({
          local: 'cabecalho', parentId: grupoMenuId,
          label: cad.nome, tipo: 'interno',
          href: `/documentos/${cad.slug}`,
          icone: cad.icone ?? undefined,
          refTipo: 'doc_cadastro', refId: id,
        });
      }
    }

    // Atualiza href do menu quando o nome muda (slug não muda, mas o label pode)
    if (dto.nome !== undefined && novaVisibilidade === 'publico') {
      await this.menus.atualizarHrefPorRef('doc_cadastro', id, `/documentos/${cad.slug}`);
    }

    // Substitui grupos se informado
    if (dto.grupoIds !== undefined) {
      await this.prisma.db.docCadastroGrupo.deleteMany({ where: { cadastroId: id } });
      if (dto.grupoIds.length > 0) {
        await this.prisma.db.docCadastroGrupo.createMany({
          data: dto.grupoIds.map((gId) => ({ tenantId, cadastroId: id, grupoId: gId })),
          skipDuplicates: true,
        });
      }
    }

    await this.audit(tenantId, atorId, 'DOC_CADASTRO_ATUALIZADO', 'doc_cadastros', id, {
      visibilidade: novaVisibilidade,
      grupoIds: dto.grupoIds,
    });
    return cad;
  }

  async excluirCadastro(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.menus.removerPorRef('doc_cadastro', id);
    // doc_cadastro_grupos cai por CASCADE (onDelete: Cascade no schema)
    await this.prisma.db.docCadastro.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'DOC_CADASTRO_EXCLUIDO', 'doc_cadastros', id, {});
    return { excluido: true };
  }

  // ───────────────────────────── Admin: tipos ──────────────────────────────

  listarTipos(cadastroId: string) {
    return this.prisma.db.docTipo.findMany({
      where: { cadastroId },
      orderBy: { ordem: 'asc' },
      select: { id: true, codigo: true, nome: true, slug: true, ordem: true, ativo: true, meta: true, parentId: true },
    });
  }

  async criarTipo(cadastroId: string, dto: { nome: string; ordem?: number; parentId?: string | null }) {
    const tenantId = TenantContext.tenantId()!;

    if (dto.parentId) {
      await this.validarParentTipo(dto.parentId, cadastroId, null);
    }

    const slug = await this.slugUnicoTipo(slugify(dto.nome), cadastroId);
    return this.prisma.db.docTipo.create({
      data: {
        tenantId, cadastroId, nome: dto.nome, slug, ordem: dto.ordem ?? 99,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async atualizarTipo(id: string, dto: { nome?: string; ordem?: number; ativo?: boolean; parentId?: string | null }) {
    if (dto.parentId !== undefined) {
      if (dto.parentId !== null) {
        // Busca cadastroId do tipo atual para validar mesmo cadastro
        const tipoAtual = await this.prisma.db.docTipo.findUnique({
          where: { id },
          select: { cadastroId: true },
        });
        if (!tipoAtual) throw new NotFoundException('Tipo não encontrado.');
        await this.validarParentTipo(dto.parentId, tipoAtual.cadastroId, id);
      }
    }

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;

    return this.prisma.db.docTipo.update({ where: { id }, data });
  }

  async excluirTipo(id: string) {
    await this.prisma.db.docTipo.delete({ where: { id } });
    return { excluido: true };
  }

  // ───────────────────────────── Admin: documentos ─────────────────────────
  async listarDocumentosAdmin(p: {
    cadastroId?: string;
    tipoId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    /** undefined = sem escopo; null = sem lotação → lista vazia; string = uuid */
    escopoSecretariaId?: string | null;
  }) {
    // Escopo null = gestor/servidor sem lotação → lista vazia
    if (p.escopoSecretariaId === null) {
      const page = Math.max(1, p.page ?? 1);
      const pageSize = Math.min(60, Math.max(1, p.pageSize ?? 20));
      return { total: 0, page, pageSize, items: [] };
    }

    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, p.pageSize ?? 20));
    const where: any = {};
    if (p.escopoSecretariaId !== undefined) where.secretariaId = p.escopoSecretariaId;
    if (p.cadastroId) where.cadastroId = p.cadastroId;
    if (p.tipoId) where.tipoId = p.tipoId;
    if (p.q && p.q.trim()) {
      const q = p.q.trim();
      const ids = await this.idsPorConteudo(q); // busca também no conteúdo do arquivo
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { numero: { contains: q, mode: 'insensitive' } },
        ...(ids.length ? [{ id: { in: ids } }] : []),
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.db.documento.count({ where }),
      this.prisma.db.documento.findMany({
        where,
        orderBy: [{ ano: 'desc' }, { publicadoEm: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, numero: true, ano: true, dataDocumento: true, titulo: true, situacao: true,
          downloads: true, ativo: true, arquivoUrl: true,
          cadastro: { select: { id: true, nome: true, slug: true } },
          tipo: { select: { id: true, nome: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async obterDocumento(id: string, escopoSecretariaId?: string | null) {
    const doc = await this.prisma.db.documento.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Documento não encontrado.');
    });
    // Escopo null = sem lotação
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }
    // Escopo uuid = só pode ver documentos da sua secretaria
    if (escopoSecretariaId !== undefined && doc.secretariaId !== escopoSecretariaId) {
      throw new ForbiddenException('Acesso negado: documento pertence a outra secretaria.');
    }
    return doc;
  }

  /**
   * Documento por id PARA O PORTAL PÚBLICO. Só retorna se o documento estiver
   * ativo e o cadastro for público e ativo (senão 404). Usado pela página de
   * detalhe (link do buscador unificado). RLS garante o tenant.
   */
  async obterDocumentoPublico(id: string) {
    const doc = await this.prisma.db.documento.findUnique({
      where: { id },
      include: {
        cadastro: { select: { slug: true, nome: true, visibilidade: true, ativo: true } },
        tipo: { select: { nome: true } },
        secretaria: { select: { nome: true, slug: true } },
      },
    });
    if (
      !doc || (doc as any).ativo === false || !doc.cadastro ||
      doc.cadastro.visibilidade !== 'publico' || doc.cadastro.ativo === false
    ) {
      throw new NotFoundException('Documento não encontrado.');
    }
    return {
      id: doc.id,
      titulo: doc.titulo,
      numero: doc.numero,
      ano: doc.ano,
      dataDocumento: doc.dataDocumento,
      ementa: doc.ementa,
      orgao: doc.orgao,
      situacao: doc.situacao,
      arquivoUrl: doc.arquivoUrl,
      tags: doc.tags,
      downloads: (doc as any).downloads ?? 0,
      cadastro: { slug: doc.cadastro.slug, nome: doc.cadastro.nome },
      tipo: doc.tipo ? { nome: doc.tipo.nome } : null,
      secretaria: doc.secretaria ?? null,
      // Texto extraído (exibido na aba de conteúdo da página de detalhe).
      // Exposto apenas para cadastros públicos (garantido pela checagem acima).
      conteudoExtraido: (doc as any).conteudoExtraido ?? null,
      ocrMetodo: (doc as any).ocrMetodo ?? null,
    };
  }

  async criarDocumento(
    dto: {
      cadastroId: string; tipoId?: string; secretariaId?: string; numero?: string; ano?: number; dataDocumento?: string;
      titulo: string; ementa?: string; orgao?: string; situacao?: string; arquivoUrl?: string; tags?: string[];
    },
    atorId?: string,
    escopoSecretariaId?: string | null,
  ) {
    // Escopo null = gestor/servidor sem lotação → 403
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }

    // Escopo uuid = força secretariaId; undefined = respeita dto
    const secretariaId = escopoSecretariaId !== undefined
      ? escopoSecretariaId
      : (dto.secretariaId || null);

    const tenantId = TenantContext.tenantId()!;
    const base = dto.numero || dto.titulo;
    const slug = await this.slugUnicoDocumento(slugify(dto.ano ? `${base}-${dto.ano}` : base), dto.cadastroId);
    const doc = await this.prisma.db.documento.create({
      data: {
        tenantId, cadastroId: dto.cadastroId, tipoId: dto.tipoId ?? null, secretariaId,
        numero: dto.numero ?? null, ano: dto.ano ?? null,
        dataDocumento: dto.dataDocumento ? new Date(dto.dataDocumento) : null,
        titulo: dto.titulo, ementa: dto.ementa ?? null, orgao: dto.orgao ?? null,
        situacao: dto.situacao ?? null, slug, arquivoUrl: dto.arquivoUrl ?? null, tags: dto.tags ?? [],
      },
    });
    await this.audit(tenantId, atorId, 'DOCUMENTO_CRIADO', 'documentos', doc.id, { titulo: doc.titulo });
    if (doc.arquivoUrl) await this.indexarConteudo(doc.id);
    this.buscaSync.enqueue('documento', doc.id).catch(() => undefined);
    return doc;
  }

  async atualizarDocumento(
    id: string,
    dto: {
      tipoId?: string | null; secretariaId?: string | null; numero?: string; ano?: number; dataDocumento?: string | null;
      titulo?: string; ementa?: string; orgao?: string; situacao?: string; arquivoUrl?: string; tags?: string[]; ativo?: boolean;
    },
    atorId?: string,
    escopoSecretariaId?: string | null,
  ) {
    // obterDocumento já valida escopo e lança 403 se necessário
    await this.obterDocumento(id, escopoSecretariaId);

    const tenantId = TenantContext.tenantId()!;
    const data: any = {};
    if (dto.tipoId !== undefined) data.tipoId = dto.tipoId;
    if (dto.secretariaId !== undefined) {
      // Escopo uuid: não pode mover documento para fora da sua secretaria
      if (escopoSecretariaId !== undefined && dto.secretariaId !== escopoSecretariaId) {
        throw new ForbiddenException('Não é permitido alterar a secretaria para fora do seu escopo.');
      }
      data.secretariaId = dto.secretariaId || null;
    }
    if (dto.numero !== undefined) data.numero = dto.numero;
    if (dto.ano !== undefined) data.ano = dto.ano;
    if (dto.dataDocumento !== undefined) data.dataDocumento = dto.dataDocumento ? new Date(dto.dataDocumento) : null;
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.ementa !== undefined) data.ementa = dto.ementa;
    if (dto.orgao !== undefined) data.orgao = dto.orgao;
    if (dto.situacao !== undefined) data.situacao = dto.situacao;
    if (dto.arquivoUrl !== undefined) data.arquivoUrl = dto.arquivoUrl;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    const doc = await this.prisma.db.documento.update({ where: { id }, data });
    await this.audit(tenantId, atorId, 'DOCUMENTO_ATUALIZADO', 'documentos', id, {});
    // Re-indexa se o arquivo mudou (limpa o conteúdo antigo até a extração).
    if (dto.arquivoUrl !== undefined) {
      await this.prisma.db.documento.update({ where: { id }, data: { conteudoExtraido: null, conteudoIndexadoEm: null } });
      if (dto.arquivoUrl) await this.indexarConteudo(id);
    }
    this.buscaSync.enqueue('documento', id).catch(() => undefined);
    return doc;
  }

  async excluirDocumento(id: string, atorId?: string, escopoSecretariaId?: string | null) {
    // obterDocumento valida escopo antes de excluir
    await this.obterDocumento(id, escopoSecretariaId);
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.documento.delete({ where: { id } });
    await this.audit(tenantId, atorId, 'DOCUMENTO_EXCLUIDO', 'documentos', id, {});
    this.buscaSync.enqueue('documento', id).catch(() => undefined);
    return { excluido: true };
  }

  /**
   * Reclassifica documentos-tipo de `transp_documentos` para os novos cadastros
   * estruturados (edital→Licitações, contrato→Contratos, concurso→Concursos;
   * carta de serviços/LAI/estatístico→Documentos Diversos). NÃO migra os
   * financeiros/planejamento (PPA/LDO/LOA/RGF/RREO/balanço/prestação) — eles
   * pertencem à Transparência financeira. Idempotente (dedup por objeto/título);
   * não apaga o original (Transparência segue intacta).
   */
  async migrarDeTransparencia() {
    const tenantId = TenantContext.tenantId()!;
    const db = this.prisma.db;
    const origem = await db.transpDocumento.findMany({
      where: { categoria: { in: ['edital_licitacao', 'contrato', 'concurso', 'carta_servicos', 'regulamento_lai', 'relatorio_estatistico_sic'] } },
      select: { categoria: true, titulo: true, exercicio: true, urlExterna: true },
    });
    const r = { licitacoes: 0, contratos: 0, concursos: 0, diversos: 0, ignorados: 0 };
    const diversos = await db.docCadastro.findFirst({ where: { slug: 'documentos-diversos' }, select: { id: true } });

    for (const d of origem) {
      const ano = d.exercicio ?? null;
      try {
        if (d.categoria === 'edital_licitacao') {
          if (await db.licitacao.findFirst({ where: { objeto: d.titulo }, select: { id: true } })) { r.ignorados++; continue; }
          const slug = await this.slugLivre('licitacao', slugify(d.titulo), tenantId);
          const lic = await db.licitacao.create({ data: { tenantId, slug, objeto: d.titulo, ano } });
          if (d.urlExterna) await db.licitacaoDocumento.create({ data: { tenantId, licitacaoId: lic.id, fase: 'Edital', titulo: d.titulo, arquivoUrl: d.urlExterna } });
          r.licitacoes++;
        } else if (d.categoria === 'contrato') {
          if (await db.contrato.findFirst({ where: { objeto: d.titulo }, select: { id: true } })) { r.ignorados++; continue; }
          const slug = await this.slugLivre('contrato', slugify(d.titulo), tenantId);
          await db.contrato.create({ data: { tenantId, slug, objeto: d.titulo, ano, arquivoUrl: d.urlExterna ?? null } });
          r.contratos++;
        } else if (d.categoria === 'concurso') {
          if (await db.concurso.findFirst({ where: { objeto: d.titulo }, select: { id: true } })) { r.ignorados++; continue; }
          const slug = await this.slugLivre('concurso', slugify(d.titulo), tenantId);
          const c = await db.concurso.create({ data: { tenantId, slug, objeto: d.titulo, ano } });
          if (d.urlExterna) await db.concursoDocumento.create({ data: { tenantId, concursoId: c.id, fase: '1 - Abertura', titulo: d.titulo, arquivoUrl: d.urlExterna } });
          r.concursos++;
        } else if (diversos) {
          if (await db.documento.findFirst({ where: { cadastroId: diversos.id, titulo: d.titulo }, select: { id: true } })) { r.ignorados++; continue; }
          const slug = await this.slugUnicoDocumento(slugify(d.titulo), diversos.id);
          await db.documento.create({ data: { tenantId, cadastroId: diversos.id, titulo: d.titulo, ano, arquivoUrl: d.urlExterna ?? null, slug } });
          r.diversos++;
        }
      } catch (e) {
        this.log.warn(`Migração de "${d.titulo}" falhou: ${(e as Error).message}`);
      }
    }
    return r;
  }

  /** slug livre numa das tabelas de cadastro migradas (licitacao/contrato/concurso). */
  private async slugLivre(tabela: 'licitacao' | 'contrato' | 'concurso', base: string, tenantId: string): Promise<string> {
    const acha = (slug: string) =>
      tabela === 'licitacao' ? this.prisma.platform().licitacao.findFirst({ where: { tenantId, slug }, select: { id: true } })
      : tabela === 'contrato' ? this.prisma.platform().contrato.findFirst({ where: { tenantId, slug }, select: { id: true } })
      : this.prisma.platform().concurso.findFirst({ where: { tenantId, slug }, select: { id: true } });
    let slug = base || tabela;
    while (await acha(slug)) slug = `${base}-${randomBytes(2).toString('hex')}`;
    return slug;
  }

  // ───────────────────────────── helpers ───────────────────────────────────

  /**
   * Valida que o parentId (se informado) pertence ao mesmo cadastro e não cria ciclo.
   * @param parentId  UUID do tipo pai proposto.
   * @param cadastroId UUID do cadastro do tipo filho.
   * @param tipoId UUID do tipo que está sendo atualizado (null ao criar).
   */
  private async validarParentTipo(parentId: string, cadastroId: string, tipoId: string | null): Promise<void> {
    // Impede auto-ciclo
    if (tipoId && parentId === tipoId) {
      throw new BadRequestException('Um tipo não pode ser pai de si mesmo.');
    }

    const parent = await this.prisma.db.docTipo.findUnique({
      where: { id: parentId },
      select: { id: true, cadastroId: true },
    });
    if (!parent) throw new BadRequestException('Tipo pai não encontrado.');
    if (parent.cadastroId !== cadastroId) {
      throw new BadRequestException('O tipo pai deve pertencer ao mesmo cadastro.');
    }

    // Impede ciclo: o parentId não pode ser um descendente do tipoId atual
    if (tipoId) {
      const descendentes = await this.descendentesTipo(tipoId, cadastroId);
      // descendentes inclui o próprio tipoId no índice 0; ignoramos a auto-relação
      if (descendentes.slice(1).includes(parentId)) {
        throw new BadRequestException('O tipo pai não pode ser um descendente do tipo atual (ciclo detectado).');
      }
    }
  }

  /** Valida que grupoIds é um array de UUIDs válidos. */
  private validarGrupoIds(grupoIds: any[]): void {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!Array.isArray(grupoIds)) throw new BadRequestException('grupoIds deve ser um array.');
    for (const id of grupoIds) {
      if (typeof id !== 'string' || !uuidRe.test(id)) {
        throw new BadRequestException(`grupoIds contém valor inválido: "${id}". Esperado UUID.`);
      }
    }
  }

  private async slugUnicoCadastro(base: string, tenantId: string): Promise<string> {
    let slug = base || 'cadastro';
    while (await this.prisma.platform().docCadastro.findFirst({ where: { tenantId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }
  private async slugUnicoTipo(base: string, cadastroId: string): Promise<string> {
    let slug = base || 'tipo';
    while (await this.prisma.db.docTipo.findFirst({ where: { cadastroId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }
  private async slugUnicoDocumento(base: string, cadastroId: string): Promise<string> {
    let slug = base || 'documento';
    while (await this.prisma.db.documento.findFirst({ where: { cadastroId, slug }, select: { id: true } })) {
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return slug;
  }

  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidade: string, entidadeId: string, dados: any) {
    try {
      await this.prisma.db.auditLog.create({ data: { tenantId, atorId: atorId ?? null, acao, entidade, entidadeId, dados } });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}: ${(e as Error).message}`);
    }
  }
}
