/**
 * Unit tests dos métodos de taxonomia da Biblioteca (Categorias e Tipos de mídia)
 * do MediaService, incluindo o teste [RLS] obrigatório para a nova tabela
 * media_tipos e a coluna media_assets.tipo_midia_id.
 *
 * Isolamento RLS: prisma.db é escopado por tenant via RLS automático. Os mocks
 * simulam a policy — um registro de outro tenant retorna null (findUnique). O
 * mock NÃO expõe prisma.platform(): qualquer método que tentasse burlar o tenant
 * via platform() lançaria e falharia o teste (guard de regressão).
 * Mesmo spec vale para portal-prefeitura e portal-camara (arquivo idêntico).
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';

const TENANT_A = 'tenant-a-uuid';
const ASSET_ID = 'asset-uuid';
const CATEGORIA_ID = 'categoria-uuid';
const TIPO_ID = 'tipo-uuid';

// ── build de mocks ───────────────────────────────────────────────────────────

const buildPrisma = () => ({
  // Propositalmente SEM `platform`: se algum método chamar prisma.platform(),
  // o teste quebra — isolando regressão que trocasse this.prisma.db por platform().
  db: {
    mediaTipoMidia: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null), // sem colisão de slug
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        ...data,
        id: TIPO_ID,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })),
      update: jest.fn().mockImplementation(({ where, data }: any) => ({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    mediaCategory: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        ...data,
        id: CATEGORIA_ID,
        criadoEm: new Date(),
      })),
      update: jest.fn().mockImplementation(({ where, data }: any) => ({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    mediaAsset: {
      findUnique: jest.fn().mockResolvedValue({ id: ASSET_ID }),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        id: ASSET_ID,
        ...data,
        categoria: { slug: 'logos' },
        tipoMidia: null,
      })),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
});

const buildStorage = () => ({
  getBuffer: jest.fn(),
  put: jest.fn(),
  getStream: jest.fn(),
  delete: jest.fn(),
});

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    get: () => ({ tenantId: TENANT_A }),
    tenantId: () => TENANT_A,
  },
}));

function buildService(prisma: any, storage: any) {
  return new MediaService(prisma as any, storage as any);
}

// ── Tipos de mídia ───────────────────────────────────────────────────────────

describe('MediaService — Tipos de mídia (media_tipos)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: MediaService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = buildService(prisma, buildStorage());
  });

  it('criarTipo persiste no tenant atual com slug derivado do nome', async () => {
    await service.criarTipo({ nome: 'Podcast Municipal' });
    const call = (prisma.db.mediaTipoMidia.create as jest.Mock).mock.calls[0][0];
    expect(call.data.tenantId).toBe(TENANT_A);
    expect(call.data.slug).toBe('podcast-municipal');
    expect(call.data.ativo).toBe(true);
  });

  it('criarTipo rejeita nome vazio', async () => {
    await expect(service.criarTipo({ nome: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('criarTipo rejeita cor não-hex', async () => {
    await expect(service.criarTipo({ nome: 'X', cor: 'azul' })).rejects.toThrow(BadRequestException);
  });

  it('criarTipo aceita cor hex válida', async () => {
    await service.criarTipo({ nome: 'X', cor: '#1a2b3c' });
    const call = (prisma.db.mediaTipoMidia.create as jest.Mock).mock.calls[0][0];
    expect(call.data.cor).toBe('#1a2b3c');
  });

  it('listarTipos (seletor) filtra apenas ativos', async () => {
    await service.listarTipos();
    expect(prisma.db.mediaTipoMidia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ativo: true } }),
    );
  });

  it('listarTiposTodas (hub) NÃO filtra por ativo', async () => {
    await service.listarTiposTodas();
    const arg = (prisma.db.mediaTipoMidia.findMany as jest.Mock).mock.calls[0][0];
    expect(arg.where).toBeUndefined();
  });

  it('atualizarTipo lança NotFound se o id não existe (RLS: null)', async () => {
    prisma.db.mediaTipoMidia.findUnique = jest.fn().mockResolvedValue(null);
    service = buildService(prisma, buildStorage());
    await expect(service.atualizarTipo(TIPO_ID, { nome: 'Novo' })).rejects.toThrow(NotFoundException);
  });

  it('excluirTipo apaga quando existe (ON DELETE SET NULL nos assets)', async () => {
    prisma.db.mediaTipoMidia.findUnique = jest.fn().mockResolvedValue({ id: TIPO_ID, nome: 'X' });
    service = buildService(prisma, buildStorage());
    await service.excluirTipo(TIPO_ID);
    expect(prisma.db.mediaTipoMidia.delete).toHaveBeenCalledWith({ where: { id: TIPO_ID } });
  });
});

// ── Categorias ───────────────────────────────────────────────────────────────

describe('MediaService — Categorias (media_categories)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: MediaService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = buildService(prisma, buildStorage());
  });

  it('criarCategoria deriva slug e aceita formato válido', async () => {
    await service.criarCategoria({ nome: 'Fotos de Eventos', tipo: 'imagem' });
    const call = (prisma.db.mediaCategory.create as jest.Mock).mock.calls[0][0];
    expect(call.data.slug).toBe('fotos-de-eventos');
    expect(call.data.tipo).toBe('imagem');
    expect(call.data.ativo).toBe(true);
  });

  it('criarCategoria rejeita formato fora do enum do sistema', async () => {
    await expect(
      service.criarCategoria({ nome: 'X', tipo: 'planilha' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('excluirCategoria bloqueia exclusão de categoria EM USO (FK RESTRICT)', async () => {
    prisma.db.mediaCategory.findUnique = jest.fn().mockResolvedValue({ id: CATEGORIA_ID, nome: 'Logos' });
    prisma.db.mediaAsset.count = jest.fn().mockResolvedValue(3);
    service = buildService(prisma, buildStorage());
    await expect(service.excluirCategoria(CATEGORIA_ID)).rejects.toThrow(ConflictException);
    expect(prisma.db.mediaCategory.delete).not.toHaveBeenCalled();
  });

  it('excluirCategoria apaga quando não há mídia vinculada', async () => {
    prisma.db.mediaCategory.findUnique = jest.fn().mockResolvedValue({ id: CATEGORIA_ID, nome: 'Logos' });
    prisma.db.mediaAsset.count = jest.fn().mockResolvedValue(0);
    service = buildService(prisma, buildStorage());
    await service.excluirCategoria(CATEGORIA_ID);
    expect(prisma.db.mediaCategory.delete).toHaveBeenCalledWith({ where: { id: CATEGORIA_ID } });
  });
});

// ── Isolamento RLS ───────────────────────────────────────────────────────────

describe('[RLS] Taxonomias da Biblioteca isoladas por tenant', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: MediaService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = buildService(prisma, buildStorage());
  });

  it('[RLS] vincular tipo de OUTRO tenant é rejeitado (findUnique null) e não grava', async () => {
    // asset existe no tenant atual; o tipo pertence a outro tenant → RLS filtra → null
    prisma.db.mediaAsset.findUnique = jest.fn().mockResolvedValue({ id: ASSET_ID });
    prisma.db.mediaTipoMidia.findUnique = jest.fn().mockResolvedValue(null);
    service = buildService(prisma, buildStorage());
    await expect(
      service.update(ASSET_ID, { tipoMidiaId: 'tipo-de-outro-tenant' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.db.mediaAsset.update).not.toHaveBeenCalled();
  });

  it('[RLS] update com tipoMidiaId null remove o rótulo (sem consultar tipo)', async () => {
    await service.update(ASSET_ID, { tipoMidiaId: null });
    const call = (prisma.db.mediaAsset.update as jest.Mock).mock.calls[0][0];
    expect(call.data.tipoMidiaId).toBeNull();
  });

  it('[RLS] taxonomias delegam a prisma.db e nunca a platform()', async () => {
    // O mock não tem prisma.platform: se algum método o usasse, lançaria.
    expect((prisma as any).platform).toBeUndefined();
    await service.listarTiposTodas();
    await service.listarCategoriasTodas();
    await service.criarTipo({ nome: 'Guard' });
    expect(prisma.db.mediaTipoMidia.findMany).toHaveBeenCalled();
    expect(prisma.db.mediaCategory.findMany).toHaveBeenCalled();
    expect(prisma.db.mediaTipoMidia.create).toHaveBeenCalled();
  });
});
