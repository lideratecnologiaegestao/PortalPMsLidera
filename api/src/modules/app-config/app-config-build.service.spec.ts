/**
 * Testes unitários para AppConfigBuildService (ADR-0006 Fase 2).
 *
 * Cobre:
 *  - solicitar: valida pré-requisitos (easProjectId, EXPO_TOKEN, apiUrl).
 *  - solicitar: cria build com status 'enfileirado' e enfileira job.
 *  - solicitar: audita APP_BUILD_SOLICITADO.
 *  - listar: retorna builds do tenant (via RLS).
 *  - obter: 404 quando build não existe.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppConfigBuildService } from './app-config-build.service';

// ── Mocks (jest.mock é içado — use literais, não vars) ───────────────────────

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: jest.fn().mockReturnValue('aaaaaaaa-0000-0000-0000-000000000001'),
  },
}));

// ── Constantes ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const BUILD_ID  = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_ID   = 'cccccccc-0000-0000-0000-000000000003';

const configValida = {
  easProjectId: 'proj-abc',
  easOwner: 'lidera',
  apiUrl: 'https://api.example.com',
  appName: 'App Teste',
  appShortName: 'Teste',
  scheme: 'appteste',
  bundleId: 'br.gov.teste',
  primaryColor: '#1351B4',
  iconStorageKey: null,
  splashStorageKey: null,
};

// ── Fábricas de mocks ─────────────────────────────────────────────────────────

const makePrisma = (configOverride: Record<string, unknown> | null = configValida) => ({
  db: {
    tenantAppConfig: {
      findUnique: jest.fn().mockResolvedValue(configOverride),
    },
    tenantAppBuild: {
      create: jest.fn().mockResolvedValue({ id: BUILD_ID, status: 'enfileirado' }),
      findMany: jest.fn().mockResolvedValue([{ id: BUILD_ID, status: 'enfileirado' }]),
      findFirst: jest.fn().mockResolvedValue(null), // 404 por padrão
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
  platform: jest.fn().mockReturnValue({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ slug: 'testetenant' }),
    },
  }),
});

const makeFila = () => ({
  add: jest.fn().mockResolvedValue({ id: BUILD_ID }),
});

function makeService(
  prismaOverride?: ReturnType<typeof makePrisma>,
  filaOverride?: ReturnType<typeof makeFila>,
) {
  const prisma = prismaOverride ?? makePrisma();
  const fila = filaOverride ?? makeFila();
  // @ts-expect-error mocks parciais são suficientes para os testes unitários
  return new AppConfigBuildService(prisma, fila);
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('AppConfigBuildService', () => {
  const origExpoToken = process.env.EXPO_TOKEN;

  beforeAll(() => {
    process.env.EXPO_TOKEN = 'token-fake-para-testes';
  });

  afterAll(() => {
    if (origExpoToken === undefined) delete process.env.EXPO_TOKEN;
    else process.env.EXPO_TOKEN = origExpoToken;
  });

  // ── solicitar ─────────────────────────────────────────────────────────────

  describe('solicitar()', () => {
    it('retorna { buildId, status: enfileirado } quando pré-requisitos OK', async () => {
      const service = makeService();
      const result = await service.solicitar('preview', USER_ID);

      expect(result.buildId).toBe(BUILD_ID);
      expect(result.status).toBe('enfileirado');
    });

    it('enfileira job com jobId = buildId (idempotência)', async () => {
      const fila = makeFila();
      const service = makeService(undefined, fila);

      await service.solicitar('production', USER_ID);

      expect(fila.add).toHaveBeenCalledWith(
        'app-build.gerar',
        expect.objectContaining({ buildId: BUILD_ID, perfil: 'production' }),
        expect.objectContaining({ jobId: BUILD_ID }),
      );
    });

    it('audita APP_BUILD_SOLICITADO', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await service.solicitar('preview', USER_ID);

      expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'APP_BUILD_SOLICITADO' }),
        }),
      );
    });

    it('400 quando easProjectId está vazio', async () => {
      const prisma = makePrisma({ ...configValida, easProjectId: '' });
      const service = makeService(prisma);

      await expect(service.solicitar('preview', USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mensagem de erro referencia EAS quando easProjectId vazio', async () => {
      const prisma = makePrisma({ ...configValida, easProjectId: '' });
      const service = makeService(prisma);

      await expect(service.solicitar('preview', USER_ID)).rejects.toThrow('Projeto EAS não configurado');
    });

    it('400 quando EXPO_TOKEN não está definido', async () => {
      delete process.env.EXPO_TOKEN;
      const service = makeService();

      try {
        await expect(service.solicitar('preview', USER_ID)).rejects.toBeInstanceOf(BadRequestException);
      } finally {
        process.env.EXPO_TOKEN = 'token-fake-para-testes';
      }
    });

    it('400 quando apiUrl está vazia', async () => {
      const prisma = makePrisma({ ...configValida, apiUrl: '' });
      const service = makeService(prisma);

      await expect(service.solicitar('preview', USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 quando config não existe (findUnique retorna null)', async () => {
      const prisma = makePrisma(null);
      const service = makeService(prisma);

      await expect(service.solicitar('preview', USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passa tenantId e slug corretos ao job', async () => {
      const fila = makeFila();
      const service = makeService(undefined, fila);

      await service.solicitar('preview', USER_ID);

      expect(fila.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tenantId: TENANT_ID, slug: 'testetenant' }),
        expect.any(Object),
      );
    });
  });

  // ── listar ────────────────────────────────────────────────────────────────

  describe('listar()', () => {
    it('retorna lista de builds do tenant', async () => {
      const service = makeService();
      const result = await service.listar(10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('aplica cap de 100 no limit', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await service.listar(999);

      expect(prisma.db.tenantAppBuild.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('cap mínimo é 1', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await service.listar(-5);

      expect(prisma.db.tenantAppBuild.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });
  });

  // ── obter ─────────────────────────────────────────────────────────────────

  describe('obter()', () => {
    it('lança NotFoundException quando build não existe', async () => {
      const service = makeService();

      await expect(service.obter('id-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna o build quando ele existe no tenant', async () => {
      const prisma = makePrisma();
      prisma.db.tenantAppBuild.findFirst = jest.fn().mockResolvedValue({
        id: BUILD_ID,
        status: 'concluido',
        easBuildUrl: 'https://expo.dev/builds/abc',
      });
      const service = makeService(prisma);

      const result = await service.obter(BUILD_ID);

      expect(result.id).toBe(BUILD_ID);
      expect(result.status).toBe('concluido');
    });

    it('passa tenantId e id corretos ao findFirst (RLS)', async () => {
      const prisma = makePrisma();
      prisma.db.tenantAppBuild.findFirst = jest.fn().mockResolvedValue({
        id: BUILD_ID,
        status: 'concluido',
      });
      const service = makeService(prisma);

      await service.obter(BUILD_ID);

      expect(prisma.db.tenantAppBuild.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: BUILD_ID, tenantId: TENANT_ID }),
        }),
      );
    });
  });
});
