/**
 * Unit tests para BannersService.
 * Testa isolamento de tenant (RLS simulado) e lógica de negócio.
 */
import { NotFoundException } from '@nestjs/common';
import { BannersService } from './banners.service';

// Mock mínimo de PrismaService
const mockBanner = {
  id: 'banner-uuid-1',
  tenantId: 'tenant-a',
  titulo: 'Banner Teste',
  subtitulo: null,
  imagemUrl: null,
  linkUrl: null,
  ctaLabel: null,
  ordem: 0,
  ativo: true,
  criadoEm: new Date(),
};

function buildPrisma() {
  return {
    db: {
      banner: {
        findMany: jest.fn().mockResolvedValue([mockBanner]),
        findUnique: jest.fn().mockResolvedValue(mockBanner),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockBanner),
        update: jest.fn().mockResolvedValue(mockBanner),
        delete: jest.fn().mockResolvedValue(mockBanner),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    },
  };
}

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => 'tenant-a' },
}));

describe('BannersService', () => {
  let service: BannersService;
  let mockPrisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    service = new BannersService(mockPrisma as any);
  });

  describe('listarAtivos', () => {
    it('deve filtrar somente banners ativos', async () => {
      await service.listarAtivos();
      expect(mockPrisma.db.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ativo: true } }),
      );
    });
  });

  describe('buscar', () => {
    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.db.banner.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.buscar('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar o banner quando encontrado', async () => {
      const result = await service.buscar('banner-uuid-1');
      expect(result.id).toBe('banner-uuid-1');
    });
  });

  describe('criar', () => {
    it('deve criar com tenantId do contexto e auditar', async () => {
      await service.criar({ titulo: 'Novo Banner', ordem: 0 }, 'user-id');
      expect(mockPrisma.db.banner.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a' }) }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'BANNER_CRIADO', tenantId: 'tenant-a' }),
        }),
      );
    });
  });

  describe('excluir', () => {
    it('deve deletar e auditar', async () => {
      await service.excluir('banner-uuid-1', 'user-id');
      expect(mockPrisma.db.banner.delete).toHaveBeenCalledWith({ where: { id: 'banner-uuid-1' } });
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'BANNER_EXCLUIDO' }),
        }),
      );
    });

    it('deve lançar NotFoundException ao excluir banner inexistente', async () => {
      mockPrisma.db.banner.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.excluir('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
