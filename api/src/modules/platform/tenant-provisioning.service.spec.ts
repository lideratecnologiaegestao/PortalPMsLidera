/**
 * Testes unitários do TenantProvisioningService.
 * PrismaService e RedisCacheService são stubados — sem banco real.
 */
import { TenantProvisioningService } from './tenant-provisioning.service';
import { CriarTenantDto } from './platform.dto';

// ── Stubs ──────────────────────────────────────────────────────────────────────

function makeFakeTenant(overrides = {}) {
  return {
    id: 'tenant-uuid-001',
    slug: 'mun-exemplo',
    nome: 'Município Exemplo',
    uf: 'MT',
    cnpj: null,
    municipioIbge: null,
    dominio: 'exemplo.mt.gov.br',
    subdominio: null,
    plano: 'padrao',
    ativo: true,
    iaTriagemHabilitada: false,
    iaChatHabilitada: false,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  };
}

/** Stub do platform() client que registra chamadas e retorna valores fixos. */
function makePlatformStub(tenant = makeFakeTenant()) {
  // cmsPage.upsert precisa retornar um objeto com `id` para que o cmsBlock.create
  // receba um pageId válido. Usamos um id fixo aqui.
  const cmsPageUpsertMock = jest.fn().mockResolvedValue({
    id: 'page-stub-uuid',
    tenantId: tenant.id,
    slug: 'home',
    titulo: 'Início',
    publicado: true,
  });
  const mediaCategoryUpsertMock = jest.fn().mockResolvedValue({});
  const createMock = jest.fn().mockResolvedValue({});
  const findFirstMock = jest.fn().mockResolvedValue(null); // sem registros pré-existentes

  return {
    tenant: {
      create: jest.fn().mockResolvedValue(tenant),
    },
    user: {
      create: createMock,
    },
    mediaCategory: {
      upsert: mediaCategoryUpsertMock,
    },
    cmsPage: {
      upsert: cmsPageUpsertMock,
      findFirst: findFirstMock,
    },
    cmsBlock: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpDocumento: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpDiaria: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpObra: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpDividaAtiva: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpTerceirizado: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpConvenio: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpLicitacao: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpContrato: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpDespesa: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpReceita: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpFolha: {
      findFirst: findFirstMock,
      create: createMock,
    },
    transpSyncLog: {
      create: createMock,
    },
  };
}

function makePrismaStub(platformStub: ReturnType<typeof makePlatformStub>) {
  return {
    platform: jest.fn().mockReturnValue(platformStub),
  } as any;
}

function makeCacheStub() {
  return {
    del: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// ── Fixture de DTO ──────────────────────────────────────────────────────────────

function makeDto(overrides: Partial<CriarTenantDto> = {}): CriarTenantDto {
  return {
    nome: 'Município Exemplo',
    slug: 'mun-exemplo',
    uf: 'MT',
    dominio: 'exemplo.mt.gov.br',
    ...overrides,
  } as CriarTenantDto;
}

// ── Testes ──────────────────────────────────────────────────────────────────────

describe('TenantProvisioningService.provisionar', () => {
  it('cria tenant e retorna { tenant, adminEmail, adminSenha }', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    const result = await service.provisionar(makeDto());

    expect(result).toHaveProperty('tenant');
    expect(result).toHaveProperty('adminEmail');
    expect(result).toHaveProperty('adminSenha');
    expect(result.tenant.id).toBe('tenant-uuid-001');
  });

  it('nunca retorna senhaHash no resultado', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    const result = await service.provisionar(makeDto());

    // O resultado não deve conter senhaHash — a senha provisória é plaintext
    // (retornada uma vez ao super_admin), mas o hash nunca deve vazar.
    expect((result as any).senhaHash).toBeUndefined();
    expect((result as any).admin?.senhaHash).toBeUndefined();
  });

  it('gera senha provisória com pelo menos 12 caracteres', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    const result = await service.provisionar(makeDto());

    expect(result.adminSenha.length).toBeGreaterThanOrEqual(12);
  });

  it('usa adminEmail do DTO quando fornecido', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    const result = await service.provisionar(
      makeDto({ adminEmail: 'contato@exemplo.mt.gov.br' }),
    );

    expect(result.adminEmail).toBe('contato@exemplo.mt.gov.br');
  });

  it('deriva adminEmail do domínio quando não informado', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    const result = await service.provisionar(makeDto({ adminEmail: undefined }));

    expect(result.adminEmail).toMatch(/^admin@/);
  });

  it('chama platform().user.create para criar o admin', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    expect(platform.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-uuid-001',
          role: 'admin_prefeitura',
          ativo: true,
        }),
      }),
    );
  });

  it('semeia as 11 categorias de mídia', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    expect(platform.mediaCategory.upsert).toHaveBeenCalledTimes(11);
  });

  it('cria a página home + 6 páginas institucionais (7 total)', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    // home + 6 institucionais/LGPD = 7 upserts de cms_pages
    expect(platform.cmsPage.upsert).toHaveBeenCalledTimes(7);
  });

  it('invalida cache Redis para os hosts do novo tenant', async () => {
    const tenant = makeFakeTenant({ dominio: 'exemplo.mt.gov.br', subdominio: null });
    const platform = makePlatformStub(tenant);
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    expect(cache.del).toHaveBeenCalledWith('tenant:host:exemplo.mt.gov.br');
  });

  it('cria transp_sync_log para todos os 11 datasets', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    expect(platform.transpSyncLog.create).toHaveBeenCalledTimes(11);
  });

  it('cria tenant com plano default "padrao" quando não informado', async () => {
    const platform = makePlatformStub();
    const prisma = makePrismaStub(platform);
    const cache = makeCacheStub();
    const service = new TenantProvisioningService(prisma, cache);

    await service.provisionar(makeDto());

    expect(platform.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plano: 'padrao' }),
      }),
    );
  });
});
