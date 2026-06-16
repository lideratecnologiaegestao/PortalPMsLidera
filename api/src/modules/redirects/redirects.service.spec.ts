/**
 * Unit tests — RedirectsService
 *
 * Cobre:
 *  A) resolve: cache hit, cache miss, '__NOT_FOUND__' (negative cache)
 *  B) criar: duplicata lança ConflictException, caminho feliz audita
 *  C) atualizar: não encontrado lança NotFoundException, audita e invalida cache
 *  D) excluir: não encontrado lança NotFoundException, audita
 *  E) bulk: idempotência (upsert), limite e validações básicas
 *  F) isolamento RLS — leitura sempre via this.prisma.db (nunca platform())
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RedirectsService } from './redirects.service';

// ─── fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const ATOR_ID = 'ator-uuid-0000-0000-0000-000000000001';
const REDIRECT_ID = 'redir-uuid-0000-0000-0000-000000000001';

const mockRedirect = {
  id: REDIRECT_ID,
  tenantId: TENANT_A,
  origem: '/index.php?option=com_content&view=article&id=1',
  destino: '/noticias/minha-noticia',
  statusCode: 301,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

// ─── mock TenantContext ───────────────────────────────────────────────────────

let mockTenantId: string = TENANT_A;

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => mockTenantId,
    get: () => ({ tenantId: mockTenantId }),
  },
}));

// ─── builders ────────────────────────────────────────────────────────────────

const buildPrisma = () => ({
  db: {
    redirect: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
});

const buildCache = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

const buildService = (prisma = buildPrisma(), cache = buildCache()) =>
  new RedirectsService(prisma as any, cache as any);

// ─── A) resolve ───────────────────────────────────────────────────────────────

describe('A) resolve', () => {
  it('deve retornar do cache quando presente (cache hit)', async () => {
    const cache = buildCache();
    const cached = { destino: '/novo', statusCode: 301 };
    cache.get.mockResolvedValue(cached);
    const prisma = buildPrisma();
    const service = buildService(prisma, cache);

    const result = await service.resolve('/index.php?id=1');

    expect(result).toEqual(cached);
    expect(prisma.db.redirect.findFirst).not.toHaveBeenCalled();
  });

  it('deve retornar null quando cache guarda __NOT_FOUND__ (negative cache)', async () => {
    const cache = buildCache();
    cache.get.mockResolvedValue('__NOT_FOUND__');
    const service = buildService(buildPrisma(), cache);

    const result = await service.resolve('/inexistente');

    expect(result).toBeNull();
  });

  it('deve buscar no banco no cache miss e armazenar resultado', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue({
      destino: '/noticias/noticia',
      statusCode: 301,
    });
    const cache = buildCache();
    const service = buildService(prisma, cache);

    const result = await service.resolve('/old-url');

    expect(result).toEqual({ destino: '/noticias/noticia', statusCode: 301 });
    expect(cache.set).toHaveBeenCalled();
  });

  it('deve guardar __NOT_FOUND__ no cache quando não há redirect ativo', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue(null);
    const cache = buildCache();
    const service = buildService(prisma, cache);

    const result = await service.resolve('/sem-redirect');

    expect(result).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('redirect:'),
      '__NOT_FOUND__',
      expect.any(Number),
    );
  });

  it('deve consultar somente o banco do tenant correto (via RLS — where com ativo:true)', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue(null);
    const service = buildService(prisma, buildCache());

    await service.resolve('/qualquer');

    // RLS garante isolamento no banco; no service deve passar where.ativo = true
    expect(prisma.db.redirect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ativo: true }) }),
    );
  });
});

// ─── B) criar ─────────────────────────────────────────────────────────────────

describe('B) criar', () => {
  it('deve lançar ConflictException quando origem já existe no tenant', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue(mockRedirect); // duplicata
    const service = buildService(prisma);

    await expect(
      service.criar({ origem: mockRedirect.origem, destino: '/outro' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.db.redirect.create).not.toHaveBeenCalled();
  });

  it('deve criar o redirect com tenantId do contexto e auditar', async () => {
    mockTenantId = TENANT_A;
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue(null); // sem duplicata
    prisma.db.redirect.create.mockResolvedValue({ ...mockRedirect });
    const service = buildService(prisma);

    await service.criar({ origem: '/old', destino: '/new' }, ATOR_ID);

    expect(prisma.db.redirect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, origem: '/old', destino: '/new' }),
      }),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'REDIRECT_CRIADO', tenantId: TENANT_A }),
      }),
    );
  });

  it('deve defaultar statusCode para 301', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findFirst.mockResolvedValue(null);
    prisma.db.redirect.create.mockResolvedValue({ ...mockRedirect, statusCode: 301 });
    const service = buildService(prisma);

    await service.criar({ origem: '/a', destino: '/b' });

    expect(prisma.db.redirect.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusCode: 301 }) }),
    );
  });

  it('deve rejeitar statusCode inválido (400)', async () => {
    const service = buildService();
    await expect(
      service.criar({ origem: '/a', destino: '/b', statusCode: 200 }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── C) atualizar ─────────────────────────────────────────────────────────────

describe('C) atualizar', () => {
  it('deve lançar NotFoundException quando redirect não existe', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.atualizar('inexistente', { destino: '/novo' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deve atualizar campos e auditar', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findUnique.mockResolvedValue({ ...mockRedirect });
    prisma.db.redirect.findFirst.mockResolvedValue(null); // sem conflito de origem
    prisma.db.redirect.update.mockResolvedValue({ ...mockRedirect, destino: '/novo' });
    const service = buildService(prisma);

    await service.atualizar(REDIRECT_ID, { destino: '/novo' }, ATOR_ID);

    expect(prisma.db.redirect.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REDIRECT_ID }, data: { destino: '/novo' } }),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'REDIRECT_ATUALIZADO' }),
      }),
    );
  });

  it('deve lançar ConflictException quando nova origem já pertence a outro redirect', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findUnique.mockResolvedValue({ ...mockRedirect }); // redirect atual
    prisma.db.redirect.findFirst.mockResolvedValue({ ...mockRedirect, id: 'outro-id' }); // conflito
    const service = buildService(prisma);

    await expect(
      service.atualizar(REDIRECT_ID, { origem: '/conflito' }),
    ).rejects.toThrow(ConflictException);
  });

  it('deve invalidar cache da origem anterior e da nova (quando mudou)', async () => {
    const prisma = buildPrisma();
    const cache = buildCache();
    prisma.db.redirect.findUnique.mockResolvedValue({ ...mockRedirect });
    prisma.db.redirect.findFirst.mockResolvedValue(null);
    prisma.db.redirect.update.mockResolvedValue({ ...mockRedirect, origem: '/nova-origem' });
    const service = buildService(prisma, cache);

    await service.atualizar(REDIRECT_ID, { origem: '/nova-origem' });

    // 2 chamadas ao del: origem anterior + nova
    expect(cache.del).toHaveBeenCalledTimes(2);
  });
});

// ─── D) excluir ───────────────────────────────────────────────────────────────

describe('D) excluir', () => {
  it('deve lançar NotFoundException quando redirect não existe', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.excluir('inexistente')).rejects.toThrow(NotFoundException);
  });

  it('deve deletar e auditar', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findUnique.mockResolvedValue({ ...mockRedirect });
    prisma.db.redirect.delete.mockResolvedValue({ ...mockRedirect });
    const service = buildService(prisma);

    const result = await service.excluir(REDIRECT_ID, ATOR_ID);

    expect(result).toEqual({ excluido: true });
    expect(prisma.db.redirect.delete).toHaveBeenCalledWith({ where: { id: REDIRECT_ID } });
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'REDIRECT_EXCLUIDO' }),
      }),
    );
  });
});

// ─── E) bulk ─────────────────────────────────────────────────────────────────

describe('E) bulk', () => {
  it('deve lançar BadRequestException com array vazio', async () => {
    const service = buildService();
    await expect(service.bulk([])).rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException quando excede limite de 2000', async () => {
    const service = buildService();
    const itens = Array.from({ length: 2001 }, (_, i) => ({
      origem: `/old-${i}`,
      destino: `/new-${i}`,
    }));
    await expect(service.bulk(itens)).rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException para item sem origem', async () => {
    const service = buildService();
    await expect(
      service.bulk([{ origem: '', destino: '/novo' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('deve fazer UPSERT: inserir novos e atualizar existentes', async () => {
    const prisma = buildPrisma();
    // '/old-1' já existe, '/old-2' é novo
    prisma.db.redirect.findMany.mockResolvedValue([
      { id: 'existing-id', origem: '/old-1' },
    ]);
    prisma.db.redirect.update.mockResolvedValue({});
    prisma.db.redirect.create.mockResolvedValue({});
    const service = buildService(prisma);

    const result = await service.bulk([
      { origem: '/old-1', destino: '/new-1' }, // atualiza
      { origem: '/old-2', destino: '/new-2' }, // insere
    ]);

    expect(result.inseridos).toBe(1);
    expect(result.atualizados).toBe(1);
    expect(prisma.db.redirect.update).toHaveBeenCalledTimes(1);
    expect(prisma.db.redirect.create).toHaveBeenCalledTimes(1);
  });

  it('deve auditar o resultado do bulk', async () => {
    const prisma = buildPrisma();
    prisma.db.redirect.findMany.mockResolvedValue([]);
    prisma.db.redirect.create.mockResolvedValue({});
    const service = buildService(prisma);

    await service.bulk([{ origem: '/a', destino: '/b' }], ATOR_ID);

    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'REDIRECT_BULK', dados: expect.objectContaining({ total: 1 }) }),
      }),
    );
  });
});

// ─── F) isolamento RLS ────────────────────────────────────────────────────────

describe('F) isolamento RLS — tenant A não acessa dados de tenant B', () => {
  it('o service nunca usa prisma.platform() em operações de leitura/escrita', () => {
    /**
     * O isolamento real é garantido pelo PostgreSQL RLS (policy "tenant_isolation"
     * em `redirects`). O PrismaService seta `app.current_tenant_id` via GUC antes
     * de cada query. Aqui verificamos que RedirectsService usa somente this.prisma.db.*
     * e nunca prisma.platform() para leituras de tenant.
     */
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'redirects.service.ts'),
      'utf-8',
    );

    // Operações de escrita e leitura devem usar this.prisma.db.*
    expect(source).toContain('this.prisma.db.redirect.findFirst');
    expect(source).toContain('this.prisma.db.redirect.create');
    expect(source).toContain('this.prisma.db.redirect.update');
    expect(source).toContain('this.prisma.db.redirect.delete');
    expect(source).toContain('this.prisma.db.auditLog.create');

    // platform() NÃO deve ser chamado — redirects são sempre tenant-scoped
    expect(source).not.toContain('this.prisma.platform()');
  });

  it('o cacheKey inclui tenantId para isolar chaves entre tenants', async () => {
    // Tenant A busca /page
    mockTenantId = TENANT_A;
    const prismaA = buildPrisma();
    const cacheA = buildCache();
    prismaA.db.redirect.findFirst.mockResolvedValue({ destino: '/nova-a', statusCode: 301 });
    const serviceA = buildService(prismaA, cacheA);
    await serviceA.resolve('/page');

    // Tenant B busca /page (cache separado)
    mockTenantId = TENANT_B;
    const prismaB = buildPrisma();
    const cacheB = buildCache();
    cacheB.get.mockResolvedValue(null);
    prismaB.db.redirect.findFirst.mockResolvedValue(null);
    const serviceB = buildService(prismaB, cacheB);
    await serviceB.resolve('/page');

    // A chave de cache do tenant A deve ser diferente do tenant B
    const keyA = (cacheA.set as jest.Mock).mock.calls[0]?.[0] as string;
    const keyB = (cacheB.set as jest.Mock).mock.calls[0]?.[0] as string;
    expect(keyA).toContain(TENANT_A);
    expect(keyB).toContain(TENANT_B);
    expect(keyA).not.toBe(keyB);
  });
});
