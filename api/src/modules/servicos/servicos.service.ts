import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarServicoDto, AtualizarServicoDto, PUBLICOS_ALVO } from './servicos.dto';
import { SERVICOS_MODELO } from './servicos-modelo';
import { BuscaSyncService } from '../busca/busca-sync.service';

/** Valores válidos de público-alvo (para sanitização do query param). */
const PUBLICOS_ALVO_VALORES = PUBLICOS_ALVO.map((p) => p.valor);

function slugify(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class ServicosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ---------------------------------------------------------------- público
  /**
   * Lista serviços publicados, ordenados por ordem e categoria.
   * Suporta filtro por `publicoAlvo` (eixo padronizado: cidadao/empresa/servidor).
   * Valores fora da lista são ignorados para evitar erro silencioso.
   */
  async listarPublicos(categoria?: string, destaque?: boolean, publicoAlvo?: string) {
    const where: Record<string, unknown> = { publicado: true };
    if (categoria) where.categoria = categoria;
    if (destaque) where.destaque = true;
    // Sanitiza: aceita o valor apenas se estiver na lista padronizada.
    if (publicoAlvo && PUBLICOS_ALVO_VALORES.includes(publicoAlvo as any)) {
      where.publicoAlvo = publicoAlvo;
    }
    return this.prisma.db.servico.findMany({
      where,
      orderBy: [{ ordem: 'asc' }, { categoria: 'asc' }],
      select: {
        id: true,
        titulo: true,
        slug: true,
        descricao: true,
        categoria: true,
        orgaoResponsavel: true,
        publicoAlvo: true,
        prazoAtendimento: true,
        custo: true,
        urlExterna: true,
        destaque: true,
        avaliacaoSoma: true,
        avaliacaoQtd: true,
        ordem: true,
      },
    });
  }

  // ------------------------------------------------ avaliação por estrelas
  private hashVotante(ip: string, ua: string, servicoId: string): string {
    const salt = process.env.ENQUETE_SALT ?? process.env.DIARIO_SIGNING_KEY ?? 'avaliacao-salt';
    return createHash('sha256').update(`${ip}|${ua}|${servicoId}|${salt}`).digest('hex');
  }

  private fmtAval(s: { avaliacaoSoma: number; avaliacaoQtd: number }, minhaNota: number | null) {
    return {
      media: s.avaliacaoQtd ? Number((s.avaliacaoSoma / s.avaliacaoQtd).toFixed(1)) : 0,
      total: s.avaliacaoQtd,
      minhaNota,
      jaAvaliou: minhaNota != null,
    };
  }

  /** Estado da avaliação de um serviço para este visitante (anônimo). */
  async getAvaliacao(slug: string, ip: string, ua: string) {
    const s = await this.prisma.db.servico.findFirst({
      where: { slug, publicado: true },
      select: { id: true, avaliacaoSoma: true, avaliacaoQtd: true },
    });
    if (!s) throw new NotFoundException('Serviço não encontrado.');
    const minha = await this.prisma.db.servicoAvaliacao.findUnique({
      where: { servicoId_votanteHash: { servicoId: s.id, votanteHash: this.hashVotante(ip, ua, s.id) } },
      select: { nota: true },
    });
    return this.fmtAval(s, minha?.nota ?? null);
  }

  /** Avalia um serviço (1–5). 1 voto por visitante (anônimo). */
  async avaliar(slug: string, nota: number, ip: string, ua: string, comentario?: string) {
    const n = Math.trunc(Number(nota));
    if (!(n >= 1 && n <= 5)) throw new BadRequestException('A nota deve ser de 1 a 5.');
    const tenantId = TenantContext.tenantId()!;
    const s = await this.prisma.db.servico.findFirst({ where: { slug, publicado: true }, select: { id: true } });
    if (!s) throw new NotFoundException('Serviço não encontrado.');
    const hash = this.hashVotante(ip, ua, s.id);
    await this.prisma.tx(async (t) => {
      try {
        await t.servicoAvaliacao.create({
          data: { tenantId, servicoId: s.id, nota: n, comentario: comentario?.trim() || null, votanteHash: hash },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Você já avaliou este serviço.');
        }
        throw e;
      }
      await t.servico.update({
        where: { id: s.id },
        data: { avaliacaoSoma: { increment: n }, avaliacaoQtd: { increment: 1 } },
      });
    });
    const atual = await this.prisma.db.servico.findUnique({
      where: { id: s.id }, select: { avaliacaoSoma: true, avaliacaoQtd: true },
    });
    return this.fmtAval(atual!, n);
  }

  /** Serviços mais avaliados (ranking por nº de avaliações). */
  async maisAvaliados(limite = 6) {
    const itens = await this.prisma.db.servico.findMany({
      where: { publicado: true, avaliacaoQtd: { gt: 0 } },
      orderBy: [{ avaliacaoQtd: 'desc' }],
      take: limite,
      select: { id: true, titulo: true, slug: true, categoria: true, avaliacaoSoma: true, avaliacaoQtd: true },
    });
    return itens.map((s) => ({
      id: s.id, titulo: s.titulo, slug: s.slug, categoria: s.categoria,
      media: Number((s.avaliacaoSoma / s.avaliacaoQtd).toFixed(1)), total: s.avaliacaoQtd,
    }));
  }

  /** Serviço publicado por slug (público). */
  async porSlugPublico(slug: string) {
    const s = await this.prisma.db.servico.findFirst({
      where: { slug, publicado: true },
    });
    if (!s) throw new NotFoundException(`Serviço "${slug}" não encontrado.`);
    return s;
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: {
    categoria?: string;
    publicado?: boolean;
    q?: string;
    publicoAlvo?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.categoria) where.categoria = opts.categoria;
    if (opts.publicado !== undefined) where.publicado = opts.publicado;
    if (opts.q) {
      where.titulo = { contains: opts.q, mode: 'insensitive' };
    }
    // Sanitiza: só filtra se o valor for um eixo reconhecido.
    if (opts.publicoAlvo && PUBLICOS_ALVO_VALORES.includes(opts.publicoAlvo as any)) {
      where.publicoAlvo = opts.publicoAlvo;
    }

    const [items, total] = await Promise.all([
      this.prisma.db.servico.findMany({
        where,
        orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.servico.count({ where }),
    ]);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscarAdmin(id: string) {
    const s = await this.prisma.db.servico.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Serviço não encontrado.');
    return s;
  }

  async criar(dto: CriarServicoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // verifica slug duplicado dentro do tenant
    const existente = await this.prisma.db.servico.findUnique({
      where: { tenantId_slug: { tenantId, slug: dto.slug } },
    });
    if (existente) {
      throw new ConflictException(`Já existe um serviço com o slug "${dto.slug}".`);
    }

    const servico = await this.prisma.db.servico.create({
      data: {
        tenantId,
        titulo: dto.titulo,
        slug: dto.slug,
        descricao: dto.descricao,
        categoria: dto.categoria,
        orgaoResponsavel: dto.orgaoResponsavel,
        publicoAlvo: dto.publicoAlvo,
        requisitos: dto.requisitos,
        etapas: (dto.etapas ?? []) as object,
        canaisAtendimento: dto.canaisAtendimento,
        prazoAtendimento: dto.prazoAtendimento,
        custo: dto.custo,
        urlExterna: dto.urlExterna,
        publicado: dto.publicado ?? false,
        destaque: dto.destaque ?? false,
        ordem: dto.ordem ?? 0,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SERVICO_CRIADO',
        entidade: 'servicos',
        entidadeId: servico.id,
        dados: { titulo: servico.titulo, slug: servico.slug },
      },
    });

    this.buscaSync.enqueue('servico', servico.id).catch(() => undefined);
    return servico;
  }

  async atualizar(id: string, dto: AtualizarServicoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscarAdmin(id); // garante que o serviço pertence ao tenant via RLS

    // se mudou o slug, verifica duplicata
    if (dto.slug) {
      const existente = await this.prisma.db.servico.findUnique({
        where: { tenantId_slug: { tenantId, slug: dto.slug } },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException(`Já existe um serviço com o slug "${dto.slug}".`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.categoria !== undefined) data.categoria = dto.categoria;
    if (dto.orgaoResponsavel !== undefined) data.orgaoResponsavel = dto.orgaoResponsavel;
    if (dto.publicoAlvo !== undefined) data.publicoAlvo = dto.publicoAlvo;
    if (dto.requisitos !== undefined) data.requisitos = dto.requisitos;
    if (dto.etapas !== undefined) data.etapas = dto.etapas as object;
    if (dto.canaisAtendimento !== undefined) data.canaisAtendimento = dto.canaisAtendimento;
    if (dto.prazoAtendimento !== undefined) data.prazoAtendimento = dto.prazoAtendimento;
    if (dto.custo !== undefined) data.custo = dto.custo;
    if (dto.urlExterna !== undefined) data.urlExterna = dto.urlExterna;
    if (dto.publicado !== undefined) data.publicado = dto.publicado;
    if (dto.destaque !== undefined) data.destaque = dto.destaque;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;

    const atualizado = await this.prisma.db.servico.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SERVICO_ATUALIZADO',
        entidade: 'servicos',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    this.buscaSync.enqueue('servico', id).catch(() => undefined);
    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const servico = await this.buscarAdmin(id);

    await this.prisma.db.servico.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SERVICO_EXCLUIDO',
        entidade: 'servicos',
        entidadeId: id,
        dados: { titulo: servico.titulo, slug: servico.slug },
      },
    });

    this.buscaSync.enqueue('servico', id).catch(() => undefined);
    return { excluido: true };
  }

  /**
   * Semeia a Carta de Serviços com o MODELO PADRÃO (serviços municipais comuns).
   * Idempotente: pula serviços cujo slug já existe. Usado no provisionamento de
   * novos tenants e disponível ao gestor ("carregar modelo padrão").
   */
  async semeiarModelo(tenantId: string) {
    const db = this.prisma.platform();
    let ordem = 0;
    let criados = 0;
    for (const m of SERVICOS_MODELO) {
      const slug = slugify(m.titulo);
      const existe = await db.servico.findFirst({ where: { tenantId, slug }, select: { id: true } });
      if (existe) { ordem++; continue; }
      await db.servico.create({
        data: {
          tenantId, titulo: m.titulo, slug, descricao: m.descricao, categoria: m.categoria,
          orgaoResponsavel: m.orgaoResponsavel, publicoAlvo: m.publicoAlvo ?? null,
          prazoAtendimento: m.prazoAtendimento ?? null, custo: m.custo ?? null,
          urlExterna: m.urlExterna ?? null, etapas: [], publicado: true,
          destaque: m.destaque ?? false, ordem: ordem++,
        },
      });
      criados++;
    }
    return { criados, total: SERVICOS_MODELO.length };
  }
}
