import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { AtualizarTenantDto, CriarTenantDto } from './platform.dto';

/**
 * CRUD de tenants — exclusivo super_admin.
 * RLS: todas as operações usam this.prisma.platform() (cross-tenant explícito).
 */
@Controller('_platform/tenants')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlatformTenantsController {
  private readonly logger = new Logger(PlatformTenantsController.name);

  /** Domínio base da plataforma (subdomínios são automáticos via curinga CF). */
  private get baseDominio(): string {
    return process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
  }

  /** Domínio próprio do cliente (não é subdomínio da plataforma)? */
  private ehDominioCustom(dominio?: string | null): boolean {
    if (!dominio) return false;
    const d = dominio.toLowerCase();
    return d !== this.baseDominio && !d.endsWith(`.${this.baseDominio}`);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly provisioning: TenantProvisioningService,
    private readonly cloudflare: CloudflareService,
  ) {}

  /**
   * GET /api/_platform/tenants?q=&ativo=&page=&pageSize=
   * Paginação simples; filtro por nome/slug/uf e por ativo.
   * Inclui cfStatus e cfCustomHostnameId para badge de status na tabela.
   */
  @Get()
  async listar(
    @Query('q') q?: string,
    @Query('ativo') ativoStr?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr ?? '20', 10) || 20));
    const skip = (page - 1) * pageSize;

    const ativoFilter =
      ativoStr === 'true' ? true : ativoStr === 'false' ? false : undefined;

    const where: Prisma.TenantWhereInput = {
      ...(ativoFilter !== undefined ? { ativo: ativoFilter } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { uf: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.platform().tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true,
          slug: true,
          nome: true,
          uf: true,
          dominio: true,
          subdominio: true,
          plano: true,
          ativo: true,
          iaTriagemHabilitada: true,
          iaChatHabilitada: true,
          cfCustomHostnameId: true,
          cfStatus: true,
          criadoEm: true,
        },
      }),
      this.prisma.platform().tenant.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * GET /api/_platform/tenants/:id
   * Detalhe completo de um tenant, incluindo campos cf_* de validação Cloudflare.
   */
  @Get(':id')
  async detalhar(@Param('id') id: string) {
    const tenant = await this.prisma.platform().tenant.findUnique({
      where: { id },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }
    return tenant;
  }

  /**
   * POST /api/_platform/tenants
   * Cria e provisiona o tenant. Retorna os dados básicos + credencial provisória do admin.
   * A senha provisória é retornada UMA única vez — o super_admin deve repassá-la ao cliente.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(
    @Body() dto: CriarTenantDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    // Validação de regra de negócio: ao menos dominio OU subdominio
    if (!dto.dominio && !dto.subdominio) {
      throw new ConflictException('Informe ao menos dominio ou subdominio para o tenant ser acessível.');
    }

    // Checa unicidades antes de criar (retorna 409 descritivo)
    await this.assertUniqueSlug(dto.slug);
    if (dto.dominio) await this.assertUniqueDominio(dto.dominio);
    if (dto.subdominio) await this.assertUniqueSubdominio(dto.subdominio);

    const { tenant, adminEmail, adminSenha, dominioCustom } =
      await this.provisioning.provisionar(dto);

    // Auditoria
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: authUser?.id ?? null,
        acao: 'PLATFORM_TENANT_CRIADO',
        entidade: 'tenant',
        entidadeId: tenant.id,
        dados: { slug: tenant.slug, nome: tenant.nome, adminEmail },
      },
    });

    return {
      tenant,
      admin: {
        email: adminEmail,
        senhaProvisoria: adminSenha, // retornada UMA vez; LGPD: o admin muda no primeiro login
      },
      // Domínio próprio: dados de validação (TXT/HTTP) p/ o cliente provar a posse.
      dominioCustom,
    };
  }

  /**
   * PATCH /api/_platform/tenants/:id
   * Atualização parcial. Invalida cache Redis quando muda host ou status ativo.
   * Quando o domínio mudar para um domínio próprio, registra o Custom Hostname
   * na Cloudflare e persiste os campos cf_* no tenant.
   */
  @Patch(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarTenantDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    const atual = await this.prisma.platform().tenant.findUnique({ where: { id } });
    if (!atual) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    // Unicidades para campos alterados
    if (dto.dominio && dto.dominio !== atual.dominio) {
      await this.assertUniqueDominio(dto.dominio, id);
    }
    if (dto.subdominio && dto.subdominio !== atual.subdominio) {
      await this.assertUniqueSubdominio(dto.subdominio, id);
    }

    // Campos cf_* a serem atualizados (somente se o domínio próprio for alterado)
    const cfData: {
      cfCustomHostnameId?: string;
      cfStatus?: string;
      cfValidacao?: any;
      cfAtualizadoEm?: Date;
    } = {};

    const dominioAlterado = dto.dominio !== undefined && dto.dominio !== atual.dominio;
    if (dominioAlterado && this.ehDominioCustom(dto.dominio) && this.cloudflare.estaConfigurado()) {
      try {
        const resultado = await this.cloudflare.registrarDominioCustomizado(dto.dominio!);
        cfData.cfCustomHostnameId = resultado.id;
        cfData.cfStatus = resultado.status;
        cfData.cfValidacao = resultado as any;
        cfData.cfAtualizadoEm = new Date();
      } catch (e) {
        // Falha na Cloudflare não quebra o PATCH — apenas logamos.
        // O super_admin pode usar o endpoint de verificação para retentar.
        this.logger.error(
          `Falha ao registrar domínio próprio "${dto.dominio}" na Cloudflare: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    const atualizado = await this.prisma.platform().tenant.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined && { nome: dto.nome }),
        ...(dto.uf !== undefined && { uf: dto.uf.toUpperCase() }),
        ...(dto.dominio !== undefined && { dominio: dto.dominio }),
        ...(dto.subdominio !== undefined && { subdominio: dto.subdominio }),
        ...(dto.plano !== undefined && { plano: dto.plano }),
        ...(dto.ativo !== undefined && { ativo: dto.ativo }),
        ...(dto.iaTriagemHabilitada !== undefined && { iaTriagemHabilitada: dto.iaTriagemHabilitada }),
        ...(dto.iaChatHabilitada !== undefined && { iaChatHabilitada: dto.iaChatHabilitada }),
        ...cfData,
      },
    });

    // Invalida cache para hosts antigos e novos
    const hostsParaInvalidar = new Set<string>();
    if (atual.dominio) hostsParaInvalidar.add(atual.dominio);
    if (atual.subdominio) hostsParaInvalidar.add(atual.subdominio);
    if (dto.dominio) hostsParaInvalidar.add(dto.dominio);
    if (dto.subdominio) hostsParaInvalidar.add(dto.subdominio);

    for (const host of hostsParaInvalidar) {
      await this.cache.del(`tenant:host:${host}`);
    }

    // Auditoria
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: authUser?.id ?? null,
        acao: 'PLATFORM_TENANT_ATUALIZADO',
        entidade: 'tenant',
        entidadeId: id,
        dados: { alteracoes: dto },
      },
    });

    return atualizado;
  }

  /**
   * POST /api/_platform/tenants/:id/dominio/verificar
   * Consulta (ou registra) o Custom Hostname na Cloudflare e persiste o estado
   * atualizado no tenant. Retorna os dados de validação para exibição ao cliente.
   */
  @Post(':id/dominio/verificar')
  @HttpCode(HttpStatus.OK)
  async verificarDominio(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUser,
  ) {
    const tenant = await this.prisma.platform().tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    if (!tenant.dominio || !this.ehDominioCustom(tenant.dominio)) {
      throw new BadRequestException('Tenant não usa domínio próprio.');
    }

    if (!this.cloudflare.estaConfigurado()) {
      throw new ServiceUnavailableException('Integração Cloudflare não configurada.');
    }

    // Consulta o status atual na Cloudflare; se não existir ainda, registra agora.
    let atual = await this.cloudflare.consultarPorHostname(tenant.dominio);
    if (!atual) {
      atual = await this.cloudflare.registrarDominioCustomizado(tenant.dominio);
    }

    // Persiste o estado atualizado via platform() (cross-tenant explícito).
    const atualizado = await this.prisma.platform().tenant.update({
      where: { id },
      data: {
        cfCustomHostnameId: atual.id,
        cfStatus: atual.status,
        cfValidacao: atual as any,
        cfAtualizadoEm: new Date(),
      },
    });

    // Auditoria
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: authUser?.id ?? null,
        acao: 'PLATFORM_DOMINIO_VERIFICADO',
        entidade: 'tenant',
        entidadeId: id,
        dados: {
          dominio: tenant.dominio,
          cfStatus: atual.status,
          cfCustomHostnameId: atual.id,
        },
      },
    });

    return {
      id: atualizado.id,
      dominio: atualizado.dominio,
      cfCustomHostnameId: atualizado.cfCustomHostnameId,
      cfStatus: atualizado.cfStatus,
      cfValidacao: atualizado.cfValidacao,
      cfAtualizadoEm: atualizado.cfAtualizadoEm,
    };
  }

  // ---- helpers ----

  private async assertUniqueSlug(slug: string, excludeId?: string): Promise<void> {
    const exists = await this.prisma.platform().tenant.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (exists) {
      throw new ConflictException(`Slug "${slug}" já está em uso.`);
    }
  }

  private async assertUniqueDominio(dominio: string, excludeId?: string): Promise<void> {
    const exists = await this.prisma.platform().tenant.findFirst({
      where: { dominio, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (exists) {
      throw new ConflictException(`Domínio "${dominio}" já está em uso.`);
    }
  }

  private async assertUniqueSubdominio(subdominio: string, excludeId?: string): Promise<void> {
    const exists = await this.prisma.platform().tenant.findFirst({
      where: { subdominio, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (exists) {
      throw new ConflictException(`Subdomínio "${subdominio}" já está em uso.`);
    }
  }
}
