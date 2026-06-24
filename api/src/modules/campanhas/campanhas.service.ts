import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { validarConfig } from './capabilities/validator';
import {
  AtualizarCampanhaDto,
  CampanhaStatus,
  CriarCampanhaDto,
  STATUS_VALIDOS,
} from './campanhas.dto';
import { BIBLIOTECA_PRESETS } from './seeds/biblioteca';

const CACHE_TTL = 60; // segundos

@Injectable()
export class CampanhasService {
  private readonly log = new Logger(CampanhasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private cacheKey(tenantId: string) {
    return `campanhas:ativas:${tenantId}`;
  }

  private async invalidarCache(tenantId: string) {
    await this.cache.del(this.cacheKey(tenantId));
  }

  private async gravarLog(
    tenantId: string,
    campaignId: string,
    acao: string,
    ator: string,
    detalhes: Record<string, unknown> = {},
  ) {
    await this.prisma.db.campaignActivationLog.create({
      data: { tenantId, campaignId, acao, ator, detalhes },
    });
  }

  private async gravarAudit(
    tenantId: string,
    atorId: string | null,
    acao: string,
    entidadeId: string,
    dados: Record<string, unknown> = {},
  ) {
    try {
      await this.prisma.db.auditLog.create({
        data: { tenantId, atorId, acao, entidade: 'campaign', entidadeId, dados },
      });
    } catch (e) {
      this.log.warn(`Falha ao auditar ${acao}/${entidadeId}: ${String(e)}`);
    }
  }

  private tenantId(): string {
    const id = TenantContext.tenantId();
    if (!id) throw new BadRequestException('Tenant não resolvido.');
    return id;
  }

  private async buscarOuFalhar(id: string) {
    const c = await this.prisma.db.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campanha não encontrada.');
    return c;
  }

  // ===========================================================================
  // CRUD DO TENANT
  // ===========================================================================

  listar() {
    return this.prisma.db.campaign.findMany({
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
    });
  }

  async detalhe(id: string) {
    return this.buscarOuFalhar(id);
  }

  async criar(dto: CriarCampanhaDto, atorId: string) {
    const tenantId = this.tenantId();

    if (!dto.nome?.trim()) throw new BadRequestException('nome é obrigatório.');
    const config = validarConfig(dto.config ?? {});

    const campanha = await this.prisma.db.campaign.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        status: 'draft',
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        prioridade: dto.prioridade ?? 100,
        config: config as object,
        recorrencia: dto.recorrencia ? (dto.recorrencia as object) : undefined,
        criadoPor: atorId,
      },
    });

    await Promise.all([
      this.gravarLog(tenantId, campanha.id, 'created', atorId, { nome: campanha.nome }),
      this.gravarAudit(tenantId, atorId, 'CAMPANHA_CRIAR', campanha.id, { nome: campanha.nome }),
      this.invalidarCache(tenantId),
    ]);

    return campanha;
  }

  async atualizar(id: string, dto: AtualizarCampanhaDto, atorId: string) {
    const tenantId = this.tenantId();
    await this.buscarOuFalhar(id);

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.prioridade !== undefined) data.prioridade = dto.prioridade;
    if (dto.recorrencia !== undefined) data.recorrencia = dto.recorrencia;
    if (dto.config !== undefined) data.config = validarConfig(dto.config) as object;

    const campanha = await this.prisma.db.campaign.update({
      where: { id },
      data: data as Parameters<typeof this.prisma.db.campaign.update>[0]['data'],
    });

    await Promise.all([
      this.gravarLog(tenantId, id, 'updated', atorId, { campos: Object.keys(dto) }),
      this.gravarAudit(tenantId, atorId, 'CAMPANHA_ATUALIZAR', id, { campos: Object.keys(dto) }),
      this.invalidarCache(tenantId),
    ]);

    return campanha;
  }

  async setStatus(id: string, status: CampanhaStatus, atorId: string) {
    const tenantId = this.tenantId();
    if (!STATUS_VALIDOS.includes(status)) {
      throw new BadRequestException(
        `Status inválido. Válidos: ${STATUS_VALIDOS.join(', ')}.`,
      );
    }
    await this.buscarOuFalhar(id);

    const campanha = await this.prisma.db.campaign.update({
      where: { id },
      data: { status },
    });

    const acao =
      status === 'active'
        ? 'activated'
        : status === 'paused'
          ? 'deactivated'
          : status === 'scheduled'
            ? 'scheduled'
            : status === 'ended'
              ? 'ended'
              : 'updated';

    await Promise.all([
      this.gravarLog(tenantId, id, acao, atorId, { status }),
      this.gravarAudit(tenantId, atorId, `CAMPANHA_STATUS_${status.toUpperCase()}`, id, {
        status,
      }),
      this.invalidarCache(tenantId),
    ]);

    return campanha;
  }

  async excluir(id: string, atorId: string) {
    const tenantId = this.tenantId();
    const c = await this.buscarOuFalhar(id);

    await this.gravarAudit(tenantId, atorId, 'CAMPANHA_EXCLUIR', id, { nome: c.nome });
    await this.prisma.db.campaign.delete({ where: { id } });
    await this.invalidarCache(tenantId);

    return { excluido: true };
  }

  // ===========================================================================
  // BIBLIOTECA DE TEMPLATES (global — leitura livre)
  // ===========================================================================

  async listarBiblioteca() {
    // leitura via prisma.db — policy SELECT USING true não exige platform()
    return this.prisma.db.campaignTemplate.findMany({
      where: { ativo: true },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    });
  }

  // ===========================================================================
  // INSTALAR PRESET
  // ===========================================================================

  async instalarPreset(templateKey: string, atorId: string) {
    const tenantId = this.tenantId();

    const template = await this.prisma.db.campaignTemplate.findUnique({
      where: { key: templateKey },
    });
    if (!template) {
      throw new NotFoundException(`Template "${templateKey}" não encontrado na biblioteca.`);
    }

    // Aplica configDefault e sugestão
    const sugestao = (template.sugestao ?? {}) as Record<string, unknown>;
    const configDefault = (template.configDefault ?? {}) as Record<string, unknown>;

    // Valida o configDefault (segurança — garante que o preset não está corrompido)
    let config: object;
    try {
      config = validarConfig(configDefault) as object;
    } catch (_e) {
      // Preset com config inválida: aceita sem validar — admin pode corrigir depois
      this.log.warn(`Template "${templateKey}" tem configDefault inválido: ${String(_e)}`);
      config = configDefault;
    }

    const startsAt = sugestao.startsAt
      ? this.resolverDataSugestao(sugestao.startsAt as string)
      : null;
    const endsAt = sugestao.endsAt
      ? this.resolverDataSugestao(sugestao.endsAt as string)
      : null;

    const campanha = await this.prisma.db.campaign.create({
      data: {
        tenantId,
        templateKey: template.key,
        nome: template.nome,
        status: 'draft',
        startsAt,
        endsAt,
        prioridade: (sugestao.prioridade as number | undefined) ?? template.prioridadeSugerida,
        config,
        recorrencia: sugestao.recorrencia ? (sugestao.recorrencia as object) : undefined,
        autonomous: false,
        criadoPor: atorId,
      },
    });

    await Promise.all([
      this.gravarLog(tenantId, campanha.id, 'installed', atorId, {
        templateKey: template.key,
      }),
      this.gravarAudit(tenantId, atorId, 'CAMPANHA_INSTALAR', campanha.id, {
        templateKey: template.key,
        nome: campanha.nome,
      }),
      this.invalidarCache(tenantId),
    ]);

    return campanha;
  }

  /**
   * Resolve uma data de sugestão ("MM-DD") para o ano corrente.
   * Garante que a data resultante é futura (se já passou, avança um ano).
   */
  private resolverDataSugestao(mmdd: string): Date {
    const [mm, dd] = mmdd.split('-').map(Number);
    const now = new Date();
    let d = new Date(Date.UTC(now.getUTCFullYear(), mm - 1, dd));
    if (d < now) d = new Date(Date.UTC(now.getUTCFullYear() + 1, mm - 1, dd));
    return d;
  }

  // ===========================================================================
  // SEMEAR BIBLIOTECA GLOBAL (SUPER_ADMIN)
  // ===========================================================================

  async semearBiblioteca(atorId?: string): Promise<{ criados: number; atualizados: number }> {
    let criados = 0;
    let atualizados = 0;

    // Leitura e escrita via platform() para satisfazer app_is_platform()
    const db = this.prisma.platform();

    for (const preset of BIBLIOTECA_PRESETS) {
      try {
        const existente = await db.campaignTemplate.findUnique({
          where: { key: preset.key },
        });

        if (existente) {
          await db.campaignTemplate.update({
            where: { key: preset.key },
            data: {
              nome: preset.nome,
              categoria: preset.categoria,
              descricao: preset.descricao,
              icone: preset.icone,
              configDefault: preset.configDefault as object,
              sugestao: preset.sugestao as object,
              prioridadeSugerida: preset.prioridadeSugerida,
              ativo: preset.ativo,
            },
          });
          atualizados++;
        } else {
          await db.campaignTemplate.create({
            data: {
              key: preset.key,
              nome: preset.nome,
              categoria: preset.categoria,
              descricao: preset.descricao,
              icone: preset.icone,
              configDefault: preset.configDefault as object,
              sugestao: preset.sugestao as object,
              prioridadeSugerida: preset.prioridadeSugerida,
              ativo: preset.ativo,
            },
          });
          criados++;
        }
      } catch (e) {
        this.log.error(`Falha ao semear preset "${preset.key}": ${String(e)}`);
      }
    }

    // Auditoria de plataforma
    try {
      await db.auditLog.create({
        data: {
          tenantId: null,
          atorId: atorId ?? null,
          acao: 'CAMPANHA_SEMEAR_BIBLIOTECA',
          entidade: 'campaign_template',
          entidadeId: null,
          dados: { criados, atualizados, total: BIBLIOTECA_PRESETS.length },
        },
      });
    } catch (e) {
      this.log.warn(`Falha ao auditar semear: ${String(e)}`);
    }

    this.log.log(`Biblioteca semeada: ${criados} criados, ${atualizados} atualizados.`);
    return { criados, atualizados };
  }

  // ===========================================================================
  // RESOLVER PÚBLICO (GET /api/campanhas/ativas)
  // ===========================================================================

  async resolverAtivas() {
    const tenantId = this.tenantId();
    const cacheKey = this.cacheKey(tenantId);

    // Cache hit
    const cached = await this.cache.get<ReturnType<typeof this.montarContexto>>(cacheKey);
    if (cached) return cached;

    const agora = new Date();

    // Busca campanhas efetivas agora (status active ou scheduled + janela de datas)
    const campanhas = await this.prisma.db.campaign.findMany({
      where: {
        status: { in: ['active', 'scheduled'] },
        OR: [
          // starts_at null = aberto à esquerda; ends_at null = aberto à direita
          { startsAt: null, endsAt: null },
          { startsAt: null, endsAt: { gte: agora } },
          { startsAt: { lte: agora }, endsAt: null },
          { startsAt: { lte: agora }, endsAt: { gte: agora } },
        ],
      },
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
    });

    const contexto = this.montarContexto(campanhas);

    await this.cache.set(cacheKey, contexto, CACHE_TTL);
    return contexto;
  }

  /**
   * Aplica a precedência §5 e monta o JSON de resposta §4.
   * Tolerante: capacidade malformada é ignorada.
   */
  private montarContexto(
    campanhas: Array<{
      id: string;
      prioridade: number;
      criadoEm: Date;
      config: unknown;
    }>,
  ) {
    // Ordenadas por prioridade desc, criadoEm desc (garantia extra)
    const sorted = [...campanhas].sort(
      (a, b) =>
        b.prioridade - a.prioridade ||
        b.criadoEm.getTime() - a.criadoEm.getTime(),
    );

    type Tema = NonNullable<ReturnType<typeof this.extrairTema>>;
    type Faixa = NonNullable<ReturnType<typeof this.extrairFaixa>>;
    type Banner = NonNullable<ReturnType<typeof this.extrairBanner>>;
    type Popup = NonNullable<ReturnType<typeof this.extrairPopup>>;
    type Efeito = NonNullable<ReturnType<typeof this.extrairEfeito>>;
    type Selo = NonNullable<ReturnType<typeof this.extrairSelo>>;
    type Pagina = NonNullable<ReturnType<typeof this.extrairPagina>>;

    let tema: Tema | null = null;
    const faixas: Faixa[] = [];
    const banners: Banner[] = [];
    let popup: Popup | null = null;
    const efeitos: Efeito[] = [];
    const selos: Selo[] = [];
    const paginas: Pagina[] = [];

    for (const c of sorted) {
      const cfg = this.parseConfig(c.config);
      if (!cfg) continue;

      // TEMA: 1 vencedor (maior prioridade = primeiro na lista sorted)
      if (!tema && cfg.tema) {
        const t = this.extrairTema(c.id, cfg.tema);
        if (t) tema = t;
      }

      // FAIXA: empilha, teto 2
      if (faixas.length < 2 && cfg.faixa) {
        const f = this.extrairFaixa(c.id, cfg.faixa);
        if (f) faixas.push(f);
      }

      // BANNER: empilha, teto 3
      if (banners.length < 3 && cfg.banner) {
        const b = this.extrairBanner(c.id, cfg.banner);
        if (b) banners.push(b);
      }

      // POPUP: 1 (maior prioridade)
      if (!popup && cfg.popup) {
        const p = this.extrairPopup(c.id, cfg.popup);
        if (p) popup = p;
      }

      // EFEITO: teto 1
      if (efeitos.length < 1 && cfg.efeito) {
        const e = this.extrairEfeito(c.id, cfg.efeito);
        if (e) efeitos.push(e);
      }

      // SELOS: empilha, teto 3
      if (selos.length < 3 && cfg.selo) {
        const s = this.extrairSelo(c.id, cfg.selo);
        if (s) selos.push(s);
      }

      // PÁGINAS: tudo (sem teto explícito no contrato)
      if (cfg.pagina) {
        const pg = this.extrairPagina(c.id, cfg.pagina);
        if (pg) paginas.push(pg);
      }
    }

    return { tema, faixas, banners, popup, efeitos, selos, paginas };
  }

  private parseConfig(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  }

  private extrairTema(campaignId: string, t: unknown) {
    try {
      if (!t || typeof t !== 'object') return null;
      const x = t as Record<string, unknown>;
      if (!x.corPrimaria) return null;
      return {
        campaignId,
        corPrimaria: x.corPrimaria as string,
        corPrimariaFg: x.corPrimariaFg as string | undefined,
        corDestaque: x.corDestaque as string | undefined,
        corSecundaria: x.corSecundaria as string | undefined,
        aplicarEm: (x.aplicarEm as string | undefined) ?? 'todo',
      };
    } catch {
      return null;
    }
  }

  private extrairFaixa(campaignId: string, f: unknown) {
    try {
      if (!f || typeof f !== 'object') return null;
      const x = f as Record<string, unknown>;
      if (!x.mensagem) return null;
      return {
        campaignId,
        mensagem: x.mensagem as string,
        link: x.link as string | undefined,
        corBg: x.corBg as string | undefined,
        corTexto: x.corTexto as string | undefined,
        dismissivel: x.dismissivel !== false,
      };
    } catch {
      return null;
    }
  }

  private extrairBanner(campaignId: string, b: unknown) {
    try {
      if (!b || typeof b !== 'object') return null;
      const x = b as Record<string, unknown>;
      if (!x.imagemUrl || !x.alt) return null;
      return {
        campaignId,
        imagemUrl: x.imagemUrl as string,
        alt: x.alt as string,
        link: x.link as string | undefined,
        posicao: (x.posicao as string | undefined) ?? 'home_topo',
      };
    } catch {
      return null;
    }
  }

  private extrairPopup(campaignId: string, p: unknown) {
    try {
      if (!p || typeof p !== 'object') return null;
      const x = p as Record<string, unknown>;
      if (!x.titulo || !x.descricao) return null;
      return {
        campaignId,
        titulo: x.titulo as string,
        subtitulo: x.subtitulo as string | undefined,
        descricao: x.descricao as string,
        bullets: x.bullets as string[] | undefined,
        imagemUrl: x.imagemUrl as string | undefined,
        ctaLabel: x.ctaLabel as string | undefined,
        ctaUrl: x.ctaUrl as string | undefined,
        frequencia: (x.frequencia as string | undefined) ?? 'dia',
        paginaAlvo: x.paginaAlvo as string | undefined,
        reabrirAposDias: (x.reabrirAposDias as number | undefined) ?? 7,
      };
    } catch {
      return null;
    }
  }

  private extrairEfeito(campaignId: string, e: unknown) {
    try {
      if (!e || typeof e !== 'object') return null;
      const x = e as Record<string, unknown>;
      if (!x.nome) return null;
      return {
        campaignId,
        nome: x.nome as string,
        params: (x.params ?? {}) as Record<string, unknown>,
        // Controles de comportamento do efeito (escopo / parar / duração).
        paginaAlvo: typeof x.paginaAlvo === 'string' && x.paginaAlvo ? x.paginaAlvo : undefined,
        // Default true: o visitante sempre pode parar o efeito (acessibilidade).
        permitirParar: x.permitirParar === undefined ? true : !!x.permitirParar,
        duracaoSegundos:
          typeof x.duracaoSegundos === 'number' && x.duracaoSegundos > 0
            ? x.duracaoSegundos
            : undefined,
      };
    } catch {
      return null;
    }
  }

  private extrairSelo(campaignId: string, s: unknown) {
    try {
      if (!s || typeof s !== 'object') return null;
      const x = s as Record<string, unknown>;
      if (!x.texto) return null;
      return {
        campaignId,
        texto: x.texto as string,
        cor: x.cor as string | undefined,
        link: x.link as string | undefined,
      };
    } catch {
      return null;
    }
  }

  private extrairPagina(campaignId: string, p: unknown) {
    try {
      if (!p || typeof p !== 'object') return null;
      const x = p as Record<string, unknown>;
      if (!x.slug) return null;
      return { campaignId, slug: x.slug as string };
    } catch {
      return null;
    }
  }
}
