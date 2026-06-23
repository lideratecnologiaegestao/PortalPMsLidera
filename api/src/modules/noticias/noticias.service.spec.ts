/**
 * Unit tests para NoticiasService.
 * Testa isolamento de tenant, lógica de publicação e slug duplicado.
 * ADR-0005 Fase 4: testa aplicação do escopoSecretariaId.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NoticiasService } from './noticias.service';

const mockNoticia = {
  id: 'noticia-uuid-1',
  tenantId: 'tenant-a',
  slug: 'minha-noticia',
  titulo: 'Minha Notícia',
  resumo: null,
  conteudo: null,
  imagemUrl: null,
  categoria: null,
  autor: null,
  publicado: false,
  publicadoEm: null,
  visualizacoes: 0,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const buildPrisma = () => ({
  db: {
    noticia: {
      findMany: jest.fn().mockResolvedValue([mockNoticia]),
      findUnique: jest.fn().mockResolvedValue(mockNoticia),
      findFirst: jest.fn().mockResolvedValue(mockNoticia),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(mockNoticia),
      update: jest.fn().mockResolvedValue({ ...mockNoticia, publicado: true, publicadoEm: new Date() }),
      delete: jest.fn().mockResolvedValue(mockNoticia),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
});

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => 'tenant-a' },
}));

const mockBuscaSync = { enqueue: jest.fn().mockResolvedValue(undefined) };

describe('NoticiasService', () => {
  let service: NoticiasService;
  let mockPrisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    service = new NoticiasService(mockPrisma as any, mockBuscaSync as any);
  });

  describe('listarPublicas', () => {
    it('deve filtrar somente notícias publicadas', async () => {
      await service.listarPublicas({ page: 1, pageSize: 10 });
      expect(mockPrisma.db.noticia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ publicado: true }) }),
      );
    });

    it('deve filtrar por categoria quando fornecida', async () => {
      await service.listarPublicas({ categoria: 'Saúde', page: 1, pageSize: 10 });
      expect(mockPrisma.db.noticia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoria: 'Saúde', publicado: true }),
        }),
      );
    });

    it('deve retornar paginação correta', async () => {
      mockPrisma.db.noticia.count = jest.fn().mockResolvedValue(25);
      const result = await service.listarPublicas({ page: 2, pageSize: 10 });
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });
  });

  describe('porSlugPublico', () => {
    it('deve lançar NotFoundException para notícia não publicada', async () => {
      mockPrisma.db.noticia.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.porSlugPublico('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar a notícia e disparar incremento de views', async () => {
      const noticia = { ...mockNoticia, publicado: true };
      mockPrisma.db.noticia.findFirst = jest.fn().mockResolvedValue(noticia);
      mockPrisma.db.noticia.update = jest.fn().mockResolvedValue(noticia);
      const result = await service.porSlugPublico('minha-noticia');
      expect(result.slug).toBe('minha-noticia');
    });
  });

  describe('criar', () => {
    it('deve lançar ConflictException para slug duplicado', async () => {
      // findUnique retorna notícia existente → slug duplicado
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(mockNoticia);
      await expect(
        service.criar({ slug: 'minha-noticia', titulo: 'Título' }, 'user-id'),
      ).rejects.toThrow(ConflictException);
    });

    it('deve criar com tenantId do contexto e auditar', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(null);
      await service.criar({ slug: 'nova-noticia', titulo: 'Nova' }, 'user-id');
      expect(mockPrisma.db.noticia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a' }) }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'NOTICIA_CRIADA' }),
        }),
      );
    });

    it('deve setar publicadoEm ao criar com publicado=true', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(null);
      await service.criar({ slug: 'pub', titulo: 'Publicada', publicado: true }, 'user-id');
      const chamada = (mockPrisma.db.noticia.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.publicadoEm).toBeInstanceOf(Date);
    });
  });

  describe('atualizar', () => {
    it('deve setar publicadoEm ao publicar pela primeira vez', async () => {
      // Notícia atual não publicada e sem publicadoEm
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue({
        ...mockNoticia,
        publicado: false,
        publicadoEm: null,
      });
      await service.atualizar('noticia-uuid-1', { publicado: true }, 'user-id');
      const chamada = (mockPrisma.db.noticia.update as jest.Mock).mock.calls[0][0];
      expect(chamada.data.publicadoEm).toBeInstanceOf(Date);
    });

    it('deve lançar ConflictException se novo slug já existe', async () => {
      const outraNoticia = { ...mockNoticia, id: 'outro-uuid', slug: 'slug-existente' };
      mockPrisma.db.noticia.findUnique = jest
        .fn()
        .mockResolvedValueOnce(mockNoticia) // buscarAdmin
        .mockResolvedValueOnce(outraNoticia); // check duplicata
      await expect(
        service.atualizar('noticia-uuid-1', { slug: 'slug-existente' }, 'user-id'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------- escopo (ADR-0005 Fase 4)
  describe('escopo de secretaria', () => {
    const SEC_A = 'sec-aaaa-0000-0000-0000-000000000000';
    const SEC_B = 'sec-bbbb-0000-0000-0000-000000000000';

    it('criar: gestor/servidor sem lotação (null) deve lançar ForbiddenException', async () => {
      await expect(
        service.criar({ slug: 'x', titulo: 'X' }, 'user-id', null),
      ).rejects.toThrow(ForbiddenException);
    });

    it('criar: gestor com escopo uuid deve forçar secretariaId da secretaria dele', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(null); // slug livre
      await service.criar({ slug: 'nova', titulo: 'Nova', secretariaId: SEC_B }, 'user-id', SEC_A);
      const chamada = (mockPrisma.db.noticia.create as jest.Mock).mock.calls[0][0];
      // deve usar SEC_A (escopo), ignorando SEC_B do dto
      expect(chamada.data.secretariaId).toBe(SEC_A);
    });

    it('criar: admin sem escopo (undefined) respeita secretariaId do dto', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(null);
      await service.criar({ slug: 'nova2', titulo: 'Nova2', secretariaId: SEC_B }, 'user-id', undefined);
      const chamada = (mockPrisma.db.noticia.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.secretariaId).toBe(SEC_B);
    });

    it('buscarAdmin: gestor com escopo deve rejeitar notícia de outra secretaria', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue({
        ...mockNoticia,
        secretariaId: SEC_B,
      });
      await expect(service.buscarAdmin('noticia-uuid-1', SEC_A)).rejects.toThrow(ForbiddenException);
    });

    it('buscarAdmin: gestor sem lotação (null) deve lançar ForbiddenException', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(mockNoticia);
      await expect(service.buscarAdmin('noticia-uuid-1', null)).rejects.toThrow(ForbiddenException);
    });

    it('listarAdmin: escopo null retorna lista vazia sem tocar no banco', async () => {
      const result = await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: null });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockPrisma.db.noticia.findMany).not.toHaveBeenCalled();
    });

    it('listarAdmin: escopo uuid filtra por secretariaId', async () => {
      await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: SEC_A });
      expect(mockPrisma.db.noticia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ secretariaId: SEC_A }),
        }),
      );
    });

    it('listarAdmin: undefined não adiciona filtro de secretaria', async () => {
      await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: undefined });
      const chamada = (mockPrisma.db.noticia.findMany as jest.Mock).mock.calls[0][0];
      expect(chamada.where).not.toHaveProperty('secretariaId');
    });
  });
});
