import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarSecretariaDto, AtualizarSecretariaDto, DadosEventoDto } from './secretarias.dto';
import { MenusService } from '../menus/menus.service';
import { BuscaSyncService } from '../busca/busca-sync.service';
import { gerarIcs, zonedToUtc, type EventoIcs } from './eventos.util';

export interface DadosUnidade {
  nome: string;
  sigla?: string;
  responsavel?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cep?: string;
  horario?: string;
  fotoUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
  ordem?: number;
  ativo?: boolean;
}

/**
 * Normaliza uma coordenada vinda do front (pode chegar como string, vazio ou
 * fora de faixa). Retorna o número válido, `null` para limpar, ou `undefined`
 * para "não mexer" (no update parcial).
 */
function coordOuNull(v: unknown, max: number): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) {
    throw new BadRequestException('Coordenada inválida.');
  }
  return n;
}

export interface DadosAutoridade {
  cargo?: string; // prefeito | vice_prefeito | primeira_dama | chefe_gabinete | outro
  nome: string;
  fotoUrl?: string;
  email?: string;
  telefone?: string;
  bio?: string;
  ordem?: number;
}

// ---------------------------------------------------------------------------
// Helpers

/**
 * Converte uma string em slug URL-safe (minúsculo, sem acento, hífens).
 * Imita o mesmo regex da migration 019_secretaria_slug.sql.
 */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    // Remove combining diacritical marks (U+0300–U+036F)
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class SecretariasService {
  private readonly logger = new Logger(SecretariasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly buscaSync: BuscaSyncService,
  ) {}

  // ---------------------------------------------------------------- público
  /** Lista secretarias ativas do tenant, ordenadas por `ordem` asc. */
  async listarAtivas() {
    return this.prisma.db.secretaria.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        nome: true,
        sigla: true,
        responsavel: true,
        fotoUrl: true,
        descricao: true,
        email: true,
        telefone: true,
        slug: true,
        ordem: true,
      },
    });
  }

  /**
   * Página pública COMPLETA da secretaria pelo slug: dados + seções (sobre,
   * secretário, competências, notícias, galeria, trabalhos, documentos).
   * As notícias/galeria/documentos são compartilhados (vêm dos sistemas gerais
   * filtrados por `secretaria_id`). Lança 404 se não encontrar.
   */
  async buscarPorSlug(slug: string) {
    const s = await this.prisma.db.secretaria.findFirst({
      where: { slug, ativo: true },
      select: {
        id: true, nome: true, sigla: true, responsavel: true, fotoUrl: true, descricao: true,
        sobre: true, competencias: true, secretarioBio: true, secretarioCargo: true,
        endereco: true, cep: true, horario: true, email: true, telefone: true, slug: true,
        unidades: {
          where: { ativo: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
          select: {
            id: true, nome: true, sigla: true, responsavel: true, cargo: true, telefone: true, email: true,
            endereco: true, cep: true, horario: true, fotoUrl: true, latitude: true, longitude: true,
          },
        },
      },
    });
    if (!s) throw new NotFoundException('Secretaria não encontrada.');

    const agora = new Date();
    const [noticias, galeria, trabalhos, documentos, eventosRaw] = await Promise.all([
      this.prisma.db.noticia.findMany({
        where: { secretariaId: s.id, publicado: true },
        orderBy: { publicadoEm: 'desc' }, take: 6,
        select: { slug: true, titulo: true, resumo: true, imagemUrl: true, publicadoEm: true },
      }),
      this.prisma.db.galeriaItem.findMany({
        where: { secretariaId: s.id },
        orderBy: { ordem: 'asc' }, take: 24,
        select: { id: true, tipo: true, fonte: true, titulo: true, url: true, youtubeId: true },
      }),
      this.prisma.db.secretariaTrabalho.findMany({
        where: { secretariaId: s.id },
        orderBy: [{ ordem: 'asc' }, { data: 'desc' }],
        select: { id: true, titulo: true, descricao: true, imagemUrl: true, data: true },
      }),
      this.prisma.db.documento.findMany({
        where: { secretariaId: s.id, ativo: true },
        orderBy: [{ ano: 'desc' }, { publicadoEm: 'desc' }], take: 50,
        select: { id: true, titulo: true, numero: true, ano: true, downloads: true, arquivoUrl: true, tipo: { select: { nome: true } } },
      }),
      // eventos futuros/em andamento (não finalizados)
      this.prisma.db.secretariaEvento.findMany({
        where: {
          secretariaId: s.id, ativo: true,
          OR: [
            { fim: { gte: agora } },
            { fim: null, inicio: { gte: new Date(agora.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        },
        orderBy: { inicio: 'asc' }, take: 50,
        include: {
          unidades: {
            include: {
              unidade: {
                select: {
                  id: true, nome: true, sigla: true, endereco: true, cep: true, horario: true,
                  telefone: true, fotoUrl: true, latitude: true, longitude: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const eventos = eventosRaw.map((e) => ({
      id: e.id, titulo: e.titulo, descricao: e.descricao, local: e.local, imagemUrl: e.imagemUrl,
      inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, timezone: e.timezone,
      unidades: e.unidades.map((u) => u.unidade),
    }));

    return { ...s, noticias, galeria, trabalhos, documentos, eventos };
  }

  // --------------------------------------------------- trabalhos (admin)
  listarTrabalhos(secretariaId: string) {
    return this.prisma.db.secretariaTrabalho.findMany({
      where: { secretariaId }, orderBy: [{ ordem: 'asc' }, { data: 'desc' }],
    });
  }
  async adicionarTrabalho(secretariaId: string, dto: { titulo: string; descricao?: string; imagemUrl?: string; data?: string; ordem?: number }) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.secretariaTrabalho.create({
      data: { tenantId, secretariaId, titulo: dto.titulo, descricao: dto.descricao || null, imagemUrl: dto.imagemUrl || null, data: dto.data ? new Date(dto.data) : null, ordem: dto.ordem ?? 0 },
    });
  }
  excluirTrabalho(id: string) {
    return this.prisma.db.secretariaTrabalho.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // --------------------------------------------------------------- admin
  async listarAdmin(opts: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.prisma.db.secretaria.findMany({
        orderBy: { ordem: 'asc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.secretaria.count(),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscar(id: string) {
    const secretaria = await this.prisma.db.secretaria.findUnique({ where: { id } });
    if (!secretaria) throw new NotFoundException('Secretaria não encontrada.');
    return secretaria;
  }

  async criar(dto: CriarSecretariaDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // Gera / normaliza o slug
    const slug = await this.gerarSlugUnico(
      dto.slug ? slugify(dto.slug) : slugify(dto.nome),
      tenantId,
    );

    const secretaria = await this.prisma.db.secretaria.create({
      data: {
        tenantId,
        nome: dto.nome,
        tipo: dto.tipo || 'secretaria',
        sigla: dto.sigla,
        responsavel: dto.responsavel,
        fotoUrl: dto.fotoUrl,
        descricao: dto.descricao,
        sobre: dto.sobre,
        competencias: dto.competencias,
        secretarioBio: dto.secretarioBio,
        secretarioCargo: dto.secretarioCargo,
        endereco: dto.endereco,
        cep: dto.cep,
        horario: dto.horario,
        email: dto.email,
        telefone: dto.telefone,
        slug,
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SECRETARIA_CRIADA',
        entidade: 'secretarias',
        entidadeId: secretaria.id,
        dados: { nome: secretaria.nome, sigla: secretaria.sigla, slug },
      },
    });

    // Hook: auto-cadastro no menu cabeçalho com rota por slug
    try {
      const grupoId = await this.menus.acharOuCriarGrupoRls(
        'cabecalho',
        'Secretarias',
        'secretarias_root',
      );
      await this.menus.criarItemAutoRls({
        local: 'cabecalho',
        parentId: grupoId,
        label: secretaria.nome,
        tipo: 'interno',
        href: `/secretarias/${slug}`,
        icone: 'building',
        refTipo: 'secretaria',
        refId: secretaria.id,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao criar item de menu para secretaria ${secretaria.id}: ${(err as Error).message}`,
      );
    }

    this.buscaSync.enqueue('secretaria', secretaria.id).catch(() => undefined);
    return secretaria;
  }

  async atualizar(id: string, dto: AtualizarSecretariaDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const anterior = await this.buscar(id); // garante existência no tenant via RLS

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.sigla !== undefined) data.sigla = dto.sigla;
    if (dto.responsavel !== undefined) data.responsavel = dto.responsavel;
    if (dto.fotoUrl !== undefined) data.fotoUrl = dto.fotoUrl;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.sobre !== undefined) data.sobre = dto.sobre;
    if (dto.competencias !== undefined) data.competencias = dto.competencias;
    if (dto.secretarioBio !== undefined) data.secretarioBio = dto.secretarioBio;
    if (dto.secretarioCargo !== undefined) data.secretarioCargo = dto.secretarioCargo;
    if (dto.endereco !== undefined) data.endereco = dto.endereco;
    if (dto.cep !== undefined) data.cep = dto.cep;
    if (dto.horario !== undefined) data.horario = dto.horario;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    // Slug: só altera se vier um valor não-vazio no DTO
    let novoSlug: string | undefined;
    if (dto.slug) {
      const candidato = slugify(dto.slug);
      // Só precisa de novo slug se for diferente do atual (citext ignora case, mas normalize igual)
      if (candidato !== (anterior.slug ?? '')) {
        novoSlug = await this.gerarSlugUnico(candidato, tenantId, id);
        data.slug = novoSlug;
      }
    }

    const atualizado = await this.prisma.db.secretaria.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SECRETARIA_ATUALIZADA',
        entidade: 'secretarias',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    // Se o slug mudou, atualiza o href do item de menu vinculado
    if (novoSlug) {
      try {
        await this.menus.atualizarHrefPorRef('secretaria', id, `/secretarias/${novoSlug}`);
      } catch (err) {
        this.logger.warn(
          `Falha ao atualizar href de menu para secretaria ${id}: ${(err as Error).message}`,
        );
      }
    }

    this.buscaSync.enqueue('secretaria', id).catch(() => undefined);
    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const secretaria = await this.buscar(id);

    await this.prisma.db.secretaria.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'SECRETARIA_EXCLUIDA',
        entidade: 'secretarias',
        entidadeId: id,
        dados: { nome: secretaria.nome },
      },
    });

    // Hook: remove item de menu vinculado
    try {
      await this.menus.removerPorRef('secretaria', id);
    } catch (err) {
      this.logger.warn(
        `Falha ao remover item de menu da secretaria ${id}: ${(err as Error).message}`,
      );
    }

    this.buscaSync.enqueue('secretaria', id).catch(() => undefined);
    return { excluido: true };
  }

  // -------------------------------------------------- unidades (admin)
  listarUnidades(orgaoId: string) {
    return this.prisma.db.orgaoUnidade.findMany({
      where: { orgaoId }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
  }
  async adicionarUnidade(orgaoId: string, dto: DadosUnidade) {
    const tenantId = TenantContext.tenantId()!;
    if (!dto.nome?.trim()) throw new BadRequestException('Informe o nome da unidade.');
    return this.prisma.db.orgaoUnidade.create({
      data: {
        tenantId, orgaoId, nome: dto.nome.trim(), sigla: dto.sigla?.trim() || null,
        responsavel: dto.responsavel?.trim() || null, cargo: dto.cargo?.trim() || null,
        telefone: dto.telefone?.trim() || null, email: dto.email?.trim() || null,
        endereco: dto.endereco?.trim() || null, cep: dto.cep?.trim() || null,
        horario: dto.horario?.trim() || null, fotoUrl: dto.fotoUrl?.trim() || null,
        latitude: coordOuNull(dto.latitude, 90), longitude: coordOuNull(dto.longitude, 180),
        ordem: dto.ordem ?? 0, ativo: dto.ativo ?? true,
      },
    });
  }
  async atualizarUnidade(id: string, dto: DadosUnidade) {
    const u = await this.prisma.db.orgaoUnidade.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.sigla !== undefined) data.sigla = dto.sigla?.trim() || null;
    if (dto.responsavel !== undefined) data.responsavel = dto.responsavel?.trim() || null;
    if (dto.cargo !== undefined) data.cargo = dto.cargo?.trim() || null;
    if (dto.telefone !== undefined) data.telefone = dto.telefone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.endereco !== undefined) data.endereco = dto.endereco?.trim() || null;
    if (dto.cep !== undefined) data.cep = dto.cep?.trim() || null;
    if (dto.horario !== undefined) data.horario = dto.horario?.trim() || null;
    if (dto.fotoUrl !== undefined) data.fotoUrl = dto.fotoUrl?.trim() || null;
    if (dto.latitude !== undefined) data.latitude = coordOuNull(dto.latitude, 90);
    if (dto.longitude !== undefined) data.longitude = coordOuNull(dto.longitude, 180);
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    return this.prisma.db.orgaoUnidade.update({ where: { id }, data });
  }
  excluirUnidade(id: string) {
    return this.prisma.db.orgaoUnidade.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ------------------------------------------------ autoridades (gabinete)
  listarAutoridades(orgaoId: string) {
    return this.prisma.db.gabineteAutoridade.findMany({
      where: { orgaoId }, orderBy: { ordem: 'asc' },
    });
  }
  async adicionarAutoridade(orgaoId: string, dto: DadosAutoridade) {
    const tenantId = TenantContext.tenantId()!;
    if (!dto.nome?.trim()) throw new BadRequestException('Informe o nome.');
    return this.prisma.db.gabineteAutoridade.create({
      data: {
        tenantId, orgaoId, cargo: dto.cargo?.trim() || 'outro', nome: dto.nome.trim(),
        fotoUrl: dto.fotoUrl?.trim() || null, email: dto.email?.trim() || null,
        telefone: dto.telefone?.trim() || null, bio: dto.bio?.trim() || null, ordem: dto.ordem ?? 0,
      },
    });
  }
  async atualizarAutoridade(id: string, dto: DadosAutoridade) {
    const a = await this.prisma.db.gabineteAutoridade.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Autoridade não encontrada.');
    const data: Record<string, unknown> = {};
    if (dto.cargo !== undefined) data.cargo = dto.cargo?.trim() || 'outro';
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.fotoUrl !== undefined) data.fotoUrl = dto.fotoUrl?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.telefone !== undefined) data.telefone = dto.telefone?.trim() || null;
    if (dto.bio !== undefined) data.bio = dto.bio?.trim() || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    return this.prisma.db.gabineteAutoridade.update({ where: { id }, data });
  }
  excluirAutoridade(id: string) {
    return this.prisma.db.gabineteAutoridade.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ------------------------------------------------- eventos (agenda)
  /** Lista os eventos de uma secretaria (admin) já com os ids de unidades. */
  async listarEventosAdmin(secretariaId: string) {
    const evs = await this.prisma.db.secretariaEvento.findMany({
      where: { secretariaId }, orderBy: { inicio: 'desc' },
      include: { unidades: { select: { unidadeId: true } } },
    });
    return evs.map(({ unidades, ...e }) => ({ ...e, unidadeIds: unidades.map((u) => u.unidadeId) }));
  }

  /** Filtra os ids informados para os que realmente são unidades da secretaria. */
  private async unidadesDaSecretaria(secretariaId: string, ids?: string[]): Promise<string[]> {
    if (!ids?.length) return [];
    const existentes = await this.prisma.db.orgaoUnidade.findMany({
      where: { orgaoId: secretariaId, id: { in: ids } }, select: { id: true },
    });
    return existentes.map((u) => u.id);
  }

  /** Converte início/fim (relógio local) para instante UTC conforme o fuso. */
  private montarDatasEvento(dto: DadosEventoDto) {
    const tz = dto.timezone?.trim() || 'America/Cuiaba';
    if (!dto.inicio?.trim()) throw new BadRequestException('Informe a data de início.');
    const inicio = zonedToUtc(dto.inicio, tz);
    const fim = dto.fim?.trim() ? zonedToUtc(dto.fim, tz) : null;
    if (Number.isNaN(inicio.getTime())) throw new BadRequestException('Data de início inválida.');
    if (fim && fim.getTime() < inicio.getTime()) throw new BadRequestException('O término é anterior ao início.');
    return { tz, inicio, fim };
  }

  async adicionarEvento(secretariaId: string, dto: DadosEventoDto) {
    const tenantId = TenantContext.tenantId()!;
    if (!dto.titulo?.trim()) throw new BadRequestException('Informe o título do evento.');
    const { tz, inicio, fim } = this.montarDatasEvento(dto);
    const unidadeIds = await this.unidadesDaSecretaria(secretariaId, dto.unidadeIds);
    return this.prisma.db.secretariaEvento.create({
      data: {
        tenantId, secretariaId, titulo: dto.titulo.trim(),
        descricao: dto.descricao?.trim() || null, local: dto.local?.trim() || null,
        imagemUrl: dto.imagemUrl?.trim() || null,
        inicio, fim, diaInteiro: dto.diaInteiro ?? false, timezone: tz,
        ativo: dto.ativo ?? true, ordem: dto.ordem ?? 0,
        unidades: { create: unidadeIds.map((uid) => ({ tenantId, unidadeId: uid })) },
      },
    });
  }

  async atualizarEvento(id: string, dto: DadosEventoDto) {
    const tenantId = TenantContext.tenantId()!;
    const ev = await this.prisma.db.secretariaEvento.findUnique({
      where: { id }, select: { id: true, secretariaId: true },
    });
    if (!ev) throw new NotFoundException('Evento não encontrado.');
    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
    if (dto.local !== undefined) data.local = dto.local?.trim() || null;
    if (dto.imagemUrl !== undefined) data.imagemUrl = dto.imagemUrl?.trim() || null;
    if (dto.diaInteiro !== undefined) data.diaInteiro = dto.diaInteiro;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.inicio !== undefined) {
      const { tz, inicio, fim } = this.montarDatasEvento(dto);
      data.timezone = tz; data.inicio = inicio; data.fim = fim;
    } else if (dto.timezone !== undefined) {
      data.timezone = dto.timezone?.trim() || 'America/Cuiaba';
    }
    if (dto.unidadeIds !== undefined) {
      const unidadeIds = await this.unidadesDaSecretaria(ev.secretariaId, dto.unidadeIds);
      data.unidades = { deleteMany: {}, create: unidadeIds.map((uid) => ({ tenantId, unidadeId: uid })) };
    }
    return this.prisma.db.secretariaEvento.update({ where: { id }, data });
  }

  excluirEvento(id: string) {
    return this.prisma.db.secretariaEvento.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  /** Gera o arquivo .ics (Apple/iPhone, Outlook desktop, etc.) de um evento. */
  async eventoIcs(id: string): Promise<{ nome: string; conteudo: string }> {
    const ev = await this.prisma.db.secretariaEvento.findFirst({
      where: { id, ativo: true },
      include: {
        secretaria: { select: { nome: true, slug: true } },
        unidades: {
          include: {
            unidade: { select: { nome: true, endereco: true, cep: true, latitude: true, longitude: true } },
          },
        },
      },
    });
    if (!ev) throw new NotFoundException('Evento não encontrado.');
    const dados: EventoIcs = {
      id: ev.id, titulo: ev.titulo, descricao: ev.descricao, local: ev.local,
      inicio: ev.inicio, fim: ev.fim, diaInteiro: ev.diaInteiro, timezone: ev.timezone,
      secretariaNome: ev.secretaria.nome,
      url: ev.secretaria.slug ? `/secretarias/${ev.secretaria.slug}` : null,
      unidades: ev.unidades.map((u) => u.unidade),
    };
    return { nome: `evento-${ev.id}.ics`, conteudo: gerarIcs(dados, new Date()) };
  }

  // ------------------------------------------------ proximidade (público)
  /**
   * Unidades de atendimento mais próximas de um ponto (lat/lng), dentro de um
   * raio em metros. Usa PostGIS (índice GIST em `geo`). Multi-tenant: roda via
   * `prisma.db`, então o GUC de tenant é aplicado na transação e o RLS isola as
   * unidades/órgãos do tenant. Só retorna unidades ativas com coordenadas.
   */
  async unidadesProximas(lat: number, lng: number, raioMetros: number) {
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
      throw new BadRequestException('Coordenadas inválidas.');
    }
    const raio = Math.min(Math.max(Number(raioMetros) || 5000, 100), 50000);
    return this.prisma.db.$queryRaw`
      SELECT u.id, u.nome, u.sigla, u.responsavel, u.cargo, u.telefone, u.email,
             u.endereco, u.cep, u.horario, u.foto_url AS "fotoUrl",
             ST_Y(u.geo::geometry) AS latitude, ST_X(u.geo::geometry) AS longitude,
             round(ST_Distance(u.geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography))::int AS "distanciaM",
             s.nome AS "orgaoNome", s.sigla AS "orgaoSigla", s.slug AS "orgaoSlug"
        FROM orgao_unidades u
        JOIN secretarias s ON s.id = u.orgao_id AND s.ativo = true
       WHERE u.ativo = true AND u.geo IS NOT NULL
         AND ST_DWithin(u.geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${raio})
       ORDER BY ST_Distance(u.geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) ASC
       LIMIT 50`;
  }

  // ------------------------------------------------ estrutura (público)
  /**
   * Estrutura organizacional montada automaticamente: gabinete (com
   * autoridades), órgãos de controle/assessoramento em destaque (procuradoria,
   * controladoria, contabilidade) e o organograma dos demais órgãos com suas
   * unidades.
   */
  async estrutura() {
    const orgaos = await this.prisma.db.secretaria.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: {
        id: true, nome: true, tipo: true, sigla: true, slug: true, responsavel: true,
        secretarioCargo: true, fotoUrl: true, descricao: true, email: true, telefone: true,
        unidades: {
          where: { ativo: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
          select: {
            id: true, nome: true, sigla: true, responsavel: true, cargo: true, telefone: true, email: true,
            endereco: true, cep: true, horario: true, fotoUrl: true, latitude: true, longitude: true,
          },
        },
      },
    });

    const CONTROLE = new Set(['procuradoria', 'controladoria', 'contabilidade']);
    const gabinete = orgaos.find((o) => o.tipo === 'gabinete') ?? null;

    // Liderança do Executivo: prefeito + vice vêm do módulo Prefeito (cadastro
    // dedicado). O Gabinete contribui apenas com chefe de gabinete / equipe.
    const [prefeitoAtual, viceAtual] = await Promise.all([
      this.prisma.db.prefeito.findFirst({
        where: { tipo: 'prefeito', atual: true, ativo: true }, orderBy: { mandatoInicio: 'desc' },
        select: { id: true, nome: true, fotoUrl: true, email: true, telefone: true },
      }),
      this.prisma.db.prefeito.findFirst({
        where: { tipo: 'vice', atual: true, ativo: true }, orderBy: { mandatoInicio: 'desc' },
        select: { id: true, nome: true, fotoUrl: true, email: true, telefone: true },
      }),
    ]);

    const lideranca: any[] = [];
    if (prefeitoAtual) lideranca.push({ ...prefeitoAtual, cargo: 'prefeito', bio: null });
    if (viceAtual) lideranca.push({ ...viceAtual, cargo: 'vice_prefeito', bio: null });

    // Autoridades cadastradas no Gabinete, exceto as que agora vêm do módulo Prefeito.
    let gabineteAutoridades: any[] = [];
    if (gabinete) {
      gabineteAutoridades = await this.prisma.db.gabineteAutoridade.findMany({
        where: { orgaoId: gabinete.id, cargo: { notIn: ['prefeito', 'vice_prefeito', 'primeira_dama'] } },
        orderBy: { ordem: 'asc' },
        select: { id: true, cargo: true, nome: true, fotoUrl: true, email: true, telefone: true, bio: true },
      });
    }

    const autoridades = [...lideranca, ...gabineteAutoridades];

    // Cabeçalho da liderança: usa o órgão 'gabinete' se existir; senão sintetiza.
    const cabecalhoGabinete = gabinete ?? {
      id: null, nome: 'Gabinete do Prefeito', tipo: 'gabinete', sigla: null, slug: null,
      responsavel: null, secretarioCargo: null, fotoUrl: null, descricao: null,
      email: null, telefone: null, unidades: [] as unknown[],
    };

    return {
      gabinete: autoridades.length > 0 ? { ...cabecalhoGabinete, autoridades } : (gabinete ? { ...gabinete, autoridades } : null),
      controle: orgaos.filter((o) => CONTROLE.has(o.tipo)),
      orgaos: orgaos.filter((o) => o.tipo !== 'gabinete' && !CONTROLE.has(o.tipo)),
    };
  }

  // --------------------------------------------------------------- helpers

  /**
   * Garante que o slug seja único dentro do tenant.
   * Se já existir outra secretaria com o mesmo slug (ignorando `excludeId`),
   * anexa os 4 primeiros chars do UUID gerado como sufixo.
   */
  private async gerarSlugUnico(
    base: string,
    tenantId: string,
    excludeId?: string,
  ): Promise<string> {
    // Usa platform() para consultar sem contexto RLS (precisamos do tenantId explícito
    // porque em alguns flows o TenantContext ainda não foi inicializado — ex.: provisioning).
    // Dentro de um request normal prisma.db funcionaria igualmente, mas platform() é
    // mais seguro aqui para não depender do AsyncLocalStorage.
    const db = this.prisma.platform();

    const jaExiste = await db.secretaria.findFirst({
      where: {
        tenantId,
        slug: base,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!jaExiste) return base;

    // Colisão: usa sufixo de 4 chars aleatórios (compatível com o backfill da migration)
    const { randomBytes } = await import('node:crypto');
    const sufixo = randomBytes(2).toString('hex'); // 4 chars hex
    return `${base}-${sufixo}`;
  }
}
