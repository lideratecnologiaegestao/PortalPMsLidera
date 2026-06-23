import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ComentarioModeradorService } from './comentario-moderador.service';

@Injectable()
export class ComentariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderador: ComentarioModeradorService,
  ) {}

  // ---------------------------------------------------------------- público

  /**
   * Lista comentários APROVADOS de uma notícia publicada.
   * LGPD: nunca expõe ip nem e-mail do autor.
   */
  async listarAprovados(noticiaId: string) {
    // Valida que a notícia existe e está publicada (RLS já filtra por tenant)
    const noticia = await this.prisma.db.noticia.findFirst({
      where: { id: noticiaId, publicado: true },
      select: { id: true },
    });
    if (!noticia) throw new NotFoundException('Notícia não encontrada.');

    return this.prisma.db.noticiaComentario.findMany({
      where: { noticiaId, status: 'aprovado' },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        autorNome: true,
        conteudo: true,
        criadoEm: true,
        // ip, autorUserId, moderadoPor, moderadoEm: NUNCA expostos aqui (LGPD)
      },
    });
  }

  /**
   * Cria um comentário em estado PENDENTE para moderação.
   * O nome do autor é buscado diretamente do banco (evita spoofing pelo cliente).
   */
  async criar(opts: {
    noticiaId: string;
    conteudo: string;
    autorUserId: string;
    ip: string | undefined;
  }) {
    const tenantId = TenantContext.tenantId()!;

    // Valida conteúdo
    const conteudo = (opts.conteudo ?? '').trim();
    if (!conteudo) throw new BadRequestException('O comentário não pode estar vazio.');
    if (conteudo.length > 2000) throw new BadRequestException('Comentário muito longo (máx. 2000 caracteres).');

    // Busca o nome real do usuário no banco (não confia no cliente)
    const usuario = await this.prisma.db.user.findUnique({
      where: { id: opts.autorUserId },
      select: { nome: true },
    });
    if (!usuario) throw new UnauthorizedException('Usuário não encontrado.');

    // Valida que a notícia existe e está publicada (RLS garante tenant isolado)
    const noticia = await this.prisma.db.noticia.findFirst({
      where: { id: opts.noticiaId, publicado: true },
      select: { id: true },
    });
    if (!noticia) throw new NotFoundException('Notícia não encontrada ou não publicada.');

    // Moderação automática em 2 camadas (determinística + IA opcional).
    // Degradação graciosa: se a IA falhar → 'pendente' (humano decide).
    const moderacao = await this.moderador.avaliar(conteudo, tenantId);
    const status = moderacao.decisao === 'reprovar' ? 'reprovado' : 'pendente';
    const autoReprovado = moderacao.decisao === 'reprovar';

    const comentario = await this.prisma.db.noticiaComentario.create({
      data: {
        tenantId,
        noticiaId: opts.noticiaId,
        autorUserId: opts.autorUserId,
        autorNome: usuario.nome,
        conteudo,
        status,
        ip: opts.ip ?? null,
        moderadoPorIa: autoReprovado,
        moderacaoMotivo: moderacao.motivo ?? null,
        moderacaoCategoria: moderacao.categoria !== 'ok' ? moderacao.categoria : null,
        // moderadoEm registra quando há decisão automática (= timestamp de criação)
        moderadoEm: autoReprovado ? new Date() : null,
      },
    });

    // Auditoria da criação (sempre)
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: opts.autorUserId,
        acao: 'COMENTARIO_CRIADO',
        entidade: 'noticia_comentarios',
        entidadeId: comentario.id,
        dados: { noticiaId: opts.noticiaId },
      },
    });

    // Auditoria adicional de auto-reprovação (ação sensível)
    if (autoReprovado) {
      await this.prisma.db.auditLog.create({
        data: {
          tenantId,
          atorId: opts.autorUserId,
          acao: 'COMENTARIO_AUTO_REPROVADO',
          entidade: 'noticia_comentarios',
          entidadeId: comentario.id,
          dados: {
            noticiaId: opts.noticiaId,
            categoria: moderacao.categoria,
            // motivo NÃO exposto ao cidadão, mas registrado na auditoria interna
            motivo: moderacao.motivo,
          },
        },
      });
    }

    // Retorna apenas o status — nunca expõe motivo/categoria ao cidadão (anti-probing)
    return { ok: true, status: status as 'reprovado' | 'pendente' };
  }

  // --------------------------------------------------------------- admin / moderação

  /**
   * Lista comentários para o painel de moderação.
   * Filtra por status (padrão: pendente).
   * Aplica escopo de secretaria: gestor/servidor só veem comentários de notícias
   * da sua secretaria; admin/ti veem tudo.
   */
  async listarAdmin(opts: {
    status?: string;
    page: number;
    pageSize: number;
    escopoSecretariaId?: string | null;
  }) {
    // Escopo null = gestor/servidor sem lotação → lista vazia
    if (opts.escopoSecretariaId === null) {
      return { items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
    }

    const statusFiltro = opts.status ?? 'pendente';
    const offset = (opts.page - 1) * opts.pageSize;

    // SQL cru (respeita RLS via prisma.db) — a leitura tipada do Prisma estava
    // disparando "Error creating UUID" ao hidratar a notícia; o JOIN cru é robusto.
    const params: unknown[] = [statusFiltro];
    let filtroEscopo = '';
    if (opts.escopoSecretariaId !== undefined) {
      params.push(opts.escopoSecretariaId);
      filtroEscopo = ` AND n.secretaria_id = $${params.length}::uuid`;
    }

    const baseFrom = `FROM noticia_comentarios c JOIN noticias n ON n.id = c.noticia_id WHERE c.status = $1${filtroEscopo}`;

    const items = await this.prisma.db.$queryRawUnsafe<
      {
        id: string;
        noticiaId: string;
        noticiaTitulo: string;
        autorNome: string;
        conteudo: string;
        criadoEm: Date;
        status: string;
        moderadoPorIa: boolean;
        moderacaoMotivo: string | null;
        moderacaoCategoria: string | null;
      }[]
    >(
      `SELECT c.id::text AS "id", c.noticia_id::text AS "noticiaId", n.titulo AS "noticiaTitulo",
              c.autor_nome AS "autorNome", c.conteudo, c.criado_em AS "criadoEm", c.status,
              c.moderado_por_ia AS "moderadoPorIa",
              c.moderacao_motivo AS "moderacaoMotivo",
              c.moderacao_categoria AS "moderacaoCategoria"
       ${baseFrom}
       ORDER BY c.criado_em DESC
       LIMIT ${opts.pageSize} OFFSET ${offset}`,
      ...params,
    );

    const totalRows = await this.prisma.db.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*)::bigint AS total ${baseFrom}`,
      ...params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  /**
   * Valida que o moderador tem escopo sobre o comentário (via secretaria da notícia).
   * Lança 403 se fora do escopo; 404 se não existe.
   */
  private async buscarComEscopo(
    id: string,
    escopoSecretariaId: string | null | undefined,
  ): Promise<{ id: string; noticiaId: string }> {
    // SQL cru (respeita RLS) — evita o bug de hidratação UUID do Prisma engine.
    const rows = await this.prisma.db.$queryRawUnsafe<
      { id: string; noticiaId: string; secretariaId: string | null }[]
    >(
      `SELECT c.id::text AS "id", c.noticia_id::text AS "noticiaId", n.secretaria_id::text AS "secretariaId"
       FROM noticia_comentarios c JOIN noticias n ON n.id = c.noticia_id
       WHERE c.id = $1::uuid`,
      id,
    );
    const comentario = rows[0];
    if (!comentario) throw new NotFoundException('Comentário não encontrado.');

    // Escopo null = gestor/servidor sem lotação → 403
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }
    // Escopo uuid = só pode moderar comentários de notícias da sua secretaria
    if (escopoSecretariaId !== undefined && comentario.secretariaId !== escopoSecretariaId) {
      throw new ForbiddenException('Acesso negado: comentário pertence a notícia de outra secretaria.');
    }

    return { id: comentario.id, noticiaId: comentario.noticiaId };
  }

  /** Aprova um comentário. Audita a ação. */
  async aprovar(id: string, moderadorId: string, escopoSecretariaId?: string | null) {
    return this.moderar(id, moderadorId, escopoSecretariaId, 'aprovado', 'COMENTARIO_APROVADO');
  }

  /** Reprova um comentário. Audita a ação. */
  async reprovar(id: string, moderadorId: string, escopoSecretariaId?: string | null) {
    return this.moderar(id, moderadorId, escopoSecretariaId, 'reprovado', 'COMENTARIO_REPROVADO');
  }

  /** Transição de status com escopo + auditoria (updateMany evita hidratar a linha). */
  private async moderar(
    id: string,
    moderadorId: string,
    escopoSecretariaId: string | null | undefined,
    novoStatus: 'aprovado' | 'reprovado',
    acao: string,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const comentario = await this.buscarComEscopo(id, escopoSecretariaId);

    await this.prisma.db.noticiaComentario.updateMany({
      where: { id },
      data: { status: novoStatus, moderadoPor: moderadorId, moderadoEm: new Date() },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: moderadorId,
        acao,
        entidade: 'noticia_comentarios',
        entidadeId: id,
        dados: { noticiaId: comentario.noticiaId },
      },
    });

    return { ok: true, status: novoStatus };
  }
}
