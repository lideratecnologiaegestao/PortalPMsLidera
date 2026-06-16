import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { CriarRedirectDto, AtualizarRedirectDto, BulkItemDto } from './redirects.dto';

const CACHE_TTL = 300; // 5 minutos
const VALID_STATUS_CODES = [301, 302, 307, 308];
// Limite de bulk para evitar timeouts
const BULK_MAX = 2000;

@Injectable()
export class RedirectsService {
  private readonly log = new Logger(RedirectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  // ------------------------------------------------------------------ helpers
  private cacheKey(tenantId: string, path: string): string {
    return `redirect:${tenantId}:${path}`;
  }

  private async invalidateCache(tenantId: string, origem: string): Promise<void> {
    await this.cache.del(this.cacheKey(tenantId, origem)).catch(() => undefined);
  }

  // ------------------------------------------------------------------ público
  /**
   * Resolve o destino de uma URL de origem.
   * Cache Redis por (tenant, path) com TTL 300s.
   * PÚBLICO — sem autenticação.
   */
  async resolve(path: string): Promise<{ destino: string; statusCode: number } | null> {
    const tenantId = TenantContext.tenantId()!;
    const key = this.cacheKey(tenantId, path);

    const cached = await this.cache.get<{ destino: string; statusCode: number } | '__NOT_FOUND__'>(key);
    if (cached === '__NOT_FOUND__') return null;
    if (cached) return cached;

    const redirect = await this.prisma.db.redirect.findFirst({
      where: { origem: path, ativo: true },
      select: { destino: true, statusCode: true },
    });

    if (!redirect) {
      // Guarda "miss" em cache para não martelar o banco com rotas inexistentes
      await this.cache.set(key, '__NOT_FOUND__', CACHE_TTL).catch(() => undefined);
      return null;
    }

    const result = { destino: redirect.destino, statusCode: redirect.statusCode };
    await this.cache.set(key, result, CACHE_TTL).catch(() => undefined);
    return result;
  }

  // ------------------------------------------------------------------ admin
  async listar(opts: { page: number; pageSize: number; q?: string }) {
    const where: Record<string, unknown> = {};
    if (opts.q) {
      where.OR = [
        { origem: { contains: opts.q, mode: 'insensitive' } },
        { destino: { contains: opts.q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.db.redirect.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.redirect.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async criar(dto: CriarRedirectDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    this.validarStatusCode(dto.statusCode);

    // Verifica duplicata (o banco lança P2002, mas queremos mensagem amigável)
    const existente = await this.prisma.db.redirect.findFirst({ where: { origem: dto.origem } });
    if (existente) {
      throw new ConflictException(`Já existe um redirect para a origem "${dto.origem}".`);
    }

    const redirect = await this.prisma.db.redirect.create({
      data: {
        tenantId,
        origem: dto.origem,
        destino: dto.destino,
        statusCode: dto.statusCode ?? 301,
        ativo: dto.ativo ?? true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'REDIRECT_CRIADO',
        entidade: 'redirects',
        entidadeId: redirect.id,
        dados: { origem: redirect.origem, destino: redirect.destino, statusCode: redirect.statusCode },
      },
    });

    await this.invalidateCache(tenantId, redirect.origem);
    return redirect;
  }

  async atualizar(id: string, dto: AtualizarRedirectDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    this.validarStatusCode(dto.statusCode);

    const atual = await this.prisma.db.redirect.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Redirect não encontrado.');

    // Se a origem mudou, verifica conflito com outra linha do mesmo tenant
    if (dto.origem && dto.origem !== atual.origem) {
      const conflito = await this.prisma.db.redirect.findFirst({ where: { origem: dto.origem } });
      if (conflito && conflito.id !== id) {
        throw new ConflictException(`Já existe um redirect para a origem "${dto.origem}".`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.origem !== undefined) data.origem = dto.origem;
    if (dto.destino !== undefined) data.destino = dto.destino;
    if (dto.statusCode !== undefined) data.statusCode = dto.statusCode;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const atualizado = await this.prisma.db.redirect.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'REDIRECT_ATUALIZADO',
        entidade: 'redirects',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    // Invalida a origem anterior e a nova (caso tenha mudado)
    await this.invalidateCache(tenantId, atual.origem);
    if (dto.origem && dto.origem !== atual.origem) {
      await this.invalidateCache(tenantId, dto.origem);
    }
    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    const redirect = await this.prisma.db.redirect.findUnique({ where: { id } });
    if (!redirect) throw new NotFoundException('Redirect não encontrado.');

    await this.prisma.db.redirect.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'REDIRECT_EXCLUIDO',
        entidade: 'redirects',
        entidadeId: id,
        dados: { origem: redirect.origem, destino: redirect.destino },
      },
    });

    await this.invalidateCache(tenantId, redirect.origem);
    return { excluido: true };
  }

  /**
   * UPSERT em lote idempotente por (tenant, origem).
   * Ideal para carga inicial dos ~1.681 redirects do Joomla.
   * Audita o resultado (inseridos + atualizados).
   */
  async bulk(itens: BulkItemDto[], atorId?: string): Promise<{ inseridos: number; atualizados: number }> {
    const tenantId = TenantContext.tenantId()!;

    if (!Array.isArray(itens) || itens.length === 0) {
      throw new BadRequestException('O array "itens" é obrigatório e deve conter ao menos um elemento.');
    }
    if (itens.length > BULK_MAX) {
      throw new BadRequestException(`Máximo de ${BULK_MAX} itens por requisição.`);
    }

    // Validações de cada item
    for (const item of itens) {
      if (!item.origem || typeof item.origem !== 'string') {
        throw new BadRequestException('Todos os itens devem ter "origem" (string não vazia).');
      }
      if (!item.destino || typeof item.destino !== 'string') {
        throw new BadRequestException('Todos os itens devem ter "destino" (string não vazia).');
      }
      if (item.statusCode !== undefined) {
        this.validarStatusCode(item.statusCode);
      }
    }

    let inseridos = 0;
    let atualizados = 0;

    // Upsert em lotes de 200 para evitar queries gigantes
    const CHUNK = 200;
    for (let i = 0; i < itens.length; i += CHUNK) {
      const lote = itens.slice(i, i + CHUNK);
      const origensLote = lote.map((x) => x.origem);

      // Busca existentes para saber o que é insert vs update
      const existentes = await this.prisma.db.redirect.findMany({
        where: { origem: { in: origensLote } },
        select: { id: true, origem: true },
      });
      const mapExistentes = new Map(existentes.map((e) => [e.origem, e.id]));

      for (const item of lote) {
        const statusCode = item.statusCode ?? 301;
        if (mapExistentes.has(item.origem)) {
          await this.prisma.db.redirect.update({
            where: { id: mapExistentes.get(item.origem)! },
            data: { destino: item.destino, statusCode, ativo: true },
          });
          atualizados++;
          await this.invalidateCache(tenantId, item.origem);
        } else {
          await this.prisma.db.redirect.create({
            data: { tenantId, origem: item.origem, destino: item.destino, statusCode, ativo: true },
          });
          inseridos++;
        }
      }
    }

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'REDIRECT_BULK',
        entidade: 'redirects',
        dados: { total: itens.length, inseridos, atualizados },
      },
    });

    return { inseridos, atualizados };
  }

  // ------------------------------------------------------------------ validações
  private validarStatusCode(code?: number): void {
    if (code !== undefined && !VALID_STATUS_CODES.includes(code)) {
      throw new BadRequestException(
        `statusCode inválido: ${code}. Valores aceitos: ${VALID_STATUS_CODES.join(', ')}.`,
      );
    }
  }
}
