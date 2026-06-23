/**
 * Testes unitários para AppConfigService (ADR-0006 Fase 1).
 *
 * Cobre:
 *  - getPublico: não expõe campos build-time sigilosos, usa cache, get-or-create.
 *  - getAdmin: expõe todos os campos incluindo build-time.
 *  - atualizar: PATCH parcial, bloqueio de campos super_admin quando role=admin_prefeitura.
 *  - uploadIcone: rejeita não-PNG, rejeita dimensões erradas, persiste e audita.
 *  - uploadSplash: rejeita não-PNG, persiste e audita.
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { AtualizarAppConfigDto } from './app-config.dto';
import { Role } from '../../common/rbac/roles.enum';

// ── mocks globais ──────────────────────────────────────────────────────────────

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: jest.fn().mockReturnValue('tenant-aaa'),
  },
}));

// Mock do sharp para validação de dimensões
jest.mock('sharp', () =>
  jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1024, height: 1024 }),
  })),
);

// ── helpers ────────────────────────────────────────────────────────────────────

const ROW_PADRAO: Record<string, unknown> & {
  id: string;
  tenantId: string;
  appName: string;
  appShortName: string;
  bundleId: string;
  scheme: string;
  apiUrl: string;
  easProjectId: string;
  easOwner: string;
  appVersion: string;
  iconStorageKey: string | null;
  splashStorageKey: string | null;
  splashBgColor: string;
  primaryColor: string;
  secondaryColor: string;
  moduloDenuncia: boolean;
  moduloMapa: boolean;
  moduloOuvidoria: boolean;
  moduloEsic: boolean;
  moduloChat: boolean;
  moduloServicos: boolean;
  moduloNoticias: boolean;
  moduloCarteira: boolean;
  moduloGaleria: boolean;
  moduloDocumentos: boolean;
  onboardingSlides: unknown[];
  acessoRapido: unknown[];
  categoriasChamados: unknown[];
  pushHabilitado: boolean;
  biometriaHabilitada: boolean;
  onboardingAtivo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
} = {
  id: 'cfg-001',
  tenantId: 'tenant-aaa',
  appName: 'Prefeitura de Exemplolandia',
  appShortName: 'Exemplolandia',
  bundleId: 'br.gov.exemplolandia.app',
  scheme: 'exemplolandia',
  apiUrl: 'https://api.exemplolandia.gov.br',
  easProjectId: 'eas-proj-001',
  easOwner: 'lidera-tecnologia',
  appVersion: '1.0.0',
  iconStorageKey: null,
  splashStorageKey: null,
  splashBgColor: '#1351b4',
  primaryColor: '#1351b4',
  secondaryColor: '#071d41',
  moduloDenuncia: true,
  moduloMapa: true,
  moduloOuvidoria: true,
  moduloEsic: true,
  moduloChat: false,
  moduloServicos: true,
  moduloNoticias: true,
  moduloCarteira: false,
  moduloGaleria: true,
  moduloDocumentos: true,
  onboardingSlides: [],
  acessoRapido: [],
  categoriasChamados: [],
  pushHabilitado: true,
  biometriaHabilitada: false,
  onboardingAtivo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

function buildPrisma(row: typeof ROW_PADRAO = ROW_PADRAO) {
  return {
    db: {
      tenantAppConfig: {
        findUnique: jest.fn().mockResolvedValue(row),
        create: jest.fn().mockResolvedValue(row),
        upsert: jest.fn().mockResolvedValue(row),
      },
      tenantTheme: {
        findFirst: jest.fn().mockResolvedValue({ tokens: { logo: { url: '/midia/logo.png' } } }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    },
  };
}

function buildCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function buildStorage() {
  return {
    put: jest.fn().mockResolvedValue('app-config/icon/tenant-aaa/abc.png'),
    get: jest.fn().mockResolvedValue({ buffer: Buffer.from(''), mime: 'image/png' }),
  };
}

function buildService(overrides?: { row?: typeof ROW_PADRAO }) {
  const prisma = buildPrisma(overrides?.row ?? ROW_PADRAO) as any;
  const cache = buildCache() as any;
  const storage = buildStorage() as any;
  return {
    service: new AppConfigService(prisma, cache, storage),
    prisma,
    cache,
    storage,
  };
}

// ── getPublico ─────────────────────────────────────────────────────────────────

describe('AppConfigService.getPublico', () => {
  it('retorna projeção runtime sem campos sigilosos', async () => {
    const { service } = buildService();
    const result = await service.getPublico();

    // campos esperados
    expect(result).toHaveProperty('appName');
    expect(result).toHaveProperty('tema');
    expect(result).toHaveProperty('modulos');
    expect(result).toHaveProperty('onboarding');
    expect(result).toHaveProperty('acessoRapido');
    expect(result).toHaveProperty('push');
    expect(result).toHaveProperty('biometria');

    // campos sigilosos NÃO devem estar presentes
    expect((result as any).bundleId).toBeUndefined();
    expect((result as any).easProjectId).toBeUndefined();
    expect((result as any).easOwner).toBeUndefined();
    expect((result as any).apiUrl).toBeUndefined();
  });

  it('usa o cache quando disponível e não bate no banco', async () => {
    const cached = { appName: 'do cache' };
    const { service, prisma } = buildService();
    (prisma.db.tenantAppConfig.findUnique as jest.Mock).mockResolvedValue(null);

    // Simula hit no cache
    const cache = buildCache() as any;
    (cache.get as jest.Mock).mockResolvedValue(cached);
    const storage = buildStorage() as any;
    const svc = new AppConfigService(prisma as any, cache, storage);

    const result = await svc.getPublico();
    expect(result).toEqual(cached);
    expect(prisma.db.tenantAppConfig.findUnique).not.toHaveBeenCalled();
  });

  it('cria a linha com defaults se ainda não existir', async () => {
    const prisma = buildPrisma() as any;
    (prisma.db.tenantAppConfig.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.db.tenantAppConfig.create as jest.Mock).mockResolvedValue(ROW_PADRAO);

    const cache = buildCache() as any;
    const storage = buildStorage() as any;
    const service = new AppConfigService(prisma, cache, storage);

    await service.getPublico();
    expect(prisma.db.tenantAppConfig.create).toHaveBeenCalled();
  });

  it('inclui logoUrl do tema quando existe', async () => {
    const { service } = buildService();
    const result = await service.getPublico();
    expect(result.logoUrl).toBe('/midia/logo.png');
  });

  it('expõe moduloGaleria e moduloDocumentos no objeto modulos', async () => {
    const { service } = buildService();
    const result = await service.getPublico();
    expect(result.modulos.galeria).toBe(true);
    expect(result.modulos.documentos).toBe(true);
  });

  it('retorna logoUrl null quando tema não tem logo', async () => {
    const prisma = buildPrisma() as any;
    (prisma.db.tenantTheme.findFirst as jest.Mock).mockResolvedValue(null);
    const cache = buildCache() as any;
    const storage = buildStorage() as any;
    const service = new AppConfigService(prisma, cache, storage);

    const result = await service.getPublico();
    expect(result.logoUrl).toBeNull();
  });
});

// ── getAdmin ───────────────────────────────────────────────────────────────────

describe('AppConfigService.getAdmin', () => {
  it('expõe campos build-time como bundleId/easProjectId/apiUrl', async () => {
    const { service } = buildService();
    const result = await service.getAdmin() as any;

    expect(result.bundleId).toBe('br.gov.exemplolandia.app');
    expect(result.easProjectId).toBe('eas-proj-001');
    expect(result.easOwner).toBe('lidera-tecnologia');
    expect(result.apiUrl).toBe('https://api.exemplolandia.gov.br');
  });

  it('inclui iconUrl e splashUrl resolvidas via proxy', async () => {
    const rowComIcon = {
      ...ROW_PADRAO,
      iconStorageKey: 'app-config/icon/tenant-aaa/xyz.png',
      splashStorageKey: 'app-config/splash/tenant-aaa/spl.png',
    };
    const { service } = buildService({ row: rowComIcon });
    const result = await service.getAdmin() as any;

    expect(result.iconUrl).toContain('/api/app-config/asset?key=');
    expect(result.splashUrl).toContain('/api/app-config/asset?key=');
  });

  it('iconUrl é null quando iconStorageKey está vazio', async () => {
    const { service } = buildService();
    const result = await service.getAdmin() as any;
    expect(result.iconUrl).toBeNull();
  });

  it('expõe moduloGaleria e moduloDocumentos no objeto modulos do admin', async () => {
    const { service } = buildService();
    const result = await service.getAdmin() as any;
    expect(result.modulos.galeria).toBe(true);
    expect(result.modulos.documentos).toBe(true);
  });
});

// ── atualizar ──────────────────────────────────────────────────────────────────

describe('AppConfigService.atualizar', () => {
  it('permite ADMIN_PREFEITURA atualizar campos runtime', async () => {
    const { service, prisma } = buildService();
    const dto: AtualizarAppConfigDto = { primaryColor: '#FF0000', moduloChat: true };

    await expect(
      service.atualizar(dto, Role.ADMIN_PREFEITURA),
    ).resolves.toBeUndefined();

    expect(prisma.db.tenantAppConfig.upsert).toHaveBeenCalled();
  });

  it('bloqueia ADMIN_PREFEITURA ao tentar alterar bundleId', async () => {
    const { service } = buildService();
    const dto: AtualizarAppConfigDto = { bundleId: 'br.gov.outro.app' };

    await expect(
      service.atualizar(dto, Role.ADMIN_PREFEITURA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia ADMIN_PREFEITURA ao tentar alterar easProjectId', async () => {
    const { service } = buildService();
    await expect(
      service.atualizar({ easProjectId: 'novo-projeto' }, Role.ADMIN_PREFEITURA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia ADMIN_PREFEITURA ao tentar alterar easOwner', async () => {
    const { service } = buildService();
    await expect(
      service.atualizar({ easOwner: 'outro-owner' }, Role.ADMIN_PREFEITURA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia ADMIN_PREFEITURA ao tentar alterar apiUrl', async () => {
    const { service } = buildService();
    await expect(
      service.atualizar({ apiUrl: 'https://outro.api.br' }, Role.ADMIN_PREFEITURA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite SUPER_ADMIN alterar bundleId/easProjectId/easOwner/apiUrl', async () => {
    const { service, prisma } = buildService();
    const dto: AtualizarAppConfigDto = {
      bundleId: 'br.gov.novo.app',
      easProjectId: 'novo-eas',
      easOwner: 'lidera',
      apiUrl: 'https://novo.api.br',
    };

    await expect(
      service.atualizar(dto, Role.SUPER_ADMIN),
    ).resolves.toBeUndefined();

    expect(prisma.db.tenantAppConfig.upsert).toHaveBeenCalled();
  });

  it('invalida o cache após atualizar', async () => {
    const { service, cache } = buildService();
    await service.atualizar({ moduloChat: true }, Role.ADMIN_PREFEITURA);
    expect(cache.del).toHaveBeenCalled();
  });

  it('não chama upsert quando DTO está vazio', async () => {
    const { service, prisma } = buildService();
    await service.atualizar({}, Role.ADMIN_PREFEITURA);
    expect(prisma.db.tenantAppConfig.upsert).not.toHaveBeenCalled();
  });

  it('aceita moduloGaleria e moduloDocumentos no DTO plano', async () => {
    const { service, prisma } = buildService();
    await service.atualizar({ moduloGaleria: false, moduloDocumentos: false }, Role.ADMIN_PREFEITURA);
    expect(prisma.db.tenantAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ moduloGaleria: false, moduloDocumentos: false }),
      }),
    );
  });

  it('mapeia galeria e documentos quando enviados via modulos aninhado', async () => {
    const { service, prisma } = buildService();
    const dto = { modulos: { galeria: false, documentos: false } } as any;
    await service.atualizar(dto, Role.ADMIN_PREFEITURA);
    expect(prisma.db.tenantAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ moduloGaleria: false, moduloDocumentos: false }),
      }),
    );
  });
});

// ── uploadIcone ────────────────────────────────────────────────────────────────

describe('AppConfigService.uploadIcone', () => {
  it('rejeita arquivo que não é PNG', async () => {
    const { service } = buildService();
    await expect(
      service.uploadIcone({
        buffer: Buffer.from('fake'),
        mimetype: 'image/jpeg',
        size: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita quando buffer está vazio', async () => {
    const { service } = buildService();
    await expect(
      service.uploadIcone({
        buffer: Buffer.alloc(0),
        mimetype: 'image/png',
        size: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita ícone com dimensões erradas (ex.: 512×512)', async () => {
    const sharpMock = require('sharp');
    sharpMock.mockImplementation(() => ({
      metadata: jest.fn().mockResolvedValue({ width: 512, height: 512 }),
    }));

    const { service } = buildService();
    await expect(
      service.uploadIcone({
        buffer: Buffer.alloc(1000),
        mimetype: 'image/png',
        size: 1000,
      }),
    ).rejects.toThrow(/1024×1024/);

    // Restaura mock para 1024×1024
    sharpMock.mockImplementation(() => ({
      metadata: jest.fn().mockResolvedValue({ width: 1024, height: 1024 }),
    }));
  });

  it('persiste no storage e grava storage_key na tabela', async () => {
    const { service, prisma, storage } = buildService();
    const url = await service.uploadIcone({
      buffer: Buffer.alloc(1000),
      mimetype: 'image/png',
      size: 1000,
    });

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('app-config/icon'),
      expect.any(Buffer),
      'image/png',
    );
    expect(prisma.db.tenantAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ iconStorageKey: expect.any(String) }),
      }),
    );
    expect(url).toContain('/api/app-config/asset');
  });

  it('grava audit_log após upload bem-sucedido', async () => {
    const { service, prisma } = buildService();
    await service.uploadIcone({
      buffer: Buffer.alloc(1000),
      mimetype: 'image/png',
      size: 1000,
    });
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'APP_CONFIG_ICONE_UPLOAD' }),
      }),
    );
  });
});

// ── uploadSplash ───────────────────────────────────────────────────────────────

describe('AppConfigService.uploadSplash', () => {
  it('rejeita arquivo que não é PNG', async () => {
    const { service } = buildService();
    await expect(
      service.uploadSplash({
        buffer: Buffer.from('fake'),
        mimetype: 'image/webp',
        size: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('aceita PNG de qualquer dimensão', async () => {
    const { service } = buildService();
    await expect(
      service.uploadSplash({
        buffer: Buffer.alloc(500),
        mimetype: 'image/png',
        size: 500,
      }),
    ).resolves.toContain('/api/app-config/asset');
  });

  it('persiste no storage com prefixo splash', async () => {
    const { service, storage } = buildService();
    await service.uploadSplash({
      buffer: Buffer.alloc(500),
      mimetype: 'image/png',
      size: 500,
    });
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('app-config/splash'),
      expect.any(Buffer),
      'image/png',
    );
  });

  it('grava audit_log após upload bem-sucedido', async () => {
    const { service, prisma } = buildService();
    await service.uploadSplash({
      buffer: Buffer.alloc(500),
      mimetype: 'image/png',
      size: 500,
    });
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'APP_CONFIG_SPLASH_UPLOAD' }),
      }),
    );
  });
});

// ── getAsset ───────────────────────────────────────────────────────────────────

describe('AppConfigService.getAsset', () => {
  it('rejeita chaves fora do prefixo app-config/', async () => {
    const { service } = buildService();
    await expect(service.getAsset('../etc/passwd')).rejects.toThrow(BadRequestException);
    await expect(service.getAsset('media/other.png')).rejects.toThrow(BadRequestException);
  });

  it('aceita chaves com prefixo app-config/', async () => {
    const { service, storage } = buildService();
    await service.getAsset('app-config/icon/tenant-aaa/abc.png');
    expect(storage.get).toHaveBeenCalledWith('app-config/icon/tenant-aaa/abc.png');
  });
});
