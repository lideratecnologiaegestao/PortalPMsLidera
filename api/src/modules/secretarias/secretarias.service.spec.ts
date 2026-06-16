/**
 * Unit tests para SecretariasService.
 */
import { NotFoundException } from '@nestjs/common';
import { SecretariasService } from './secretarias.service';

const mockSecretaria = {
  id: 'sec-uuid-1',
  tenantId: 'tenant-a',
  nome: 'Secretaria de Saúde',
  sigla: 'SMS',
  email: null,
  telefone: null,
  responsavel: 'Dr. João',
  fotoUrl: null,
  descricao: 'Cuidando da saúde do município.',
  slug: 'secretaria-de-saude',
  ordem: 0,
  ativo: true,
  criadoEm: new Date(),
};

const buildPrisma = () => ({
  db: {
    secretaria: {
      findMany: jest.fn().mockResolvedValue([mockSecretaria]),
      findFirst: jest.fn().mockResolvedValue(mockSecretaria),
      findUnique: jest.fn().mockResolvedValue(mockSecretaria),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(mockSecretaria),
      update: jest.fn().mockResolvedValue(mockSecretaria),
      delete: jest.fn().mockResolvedValue(mockSecretaria),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
  // platform() retorna client sem RLS — usado em gerarSlugUnico
  platform: jest.fn().mockReturnValue({
    secretaria: {
      findFirst: jest.fn().mockResolvedValue(null), // sem colisão de slug por padrão
    },
  }),
});

const buildMenus = () => ({
  acharOuCriarGrupoRls: jest.fn().mockResolvedValue('grupo-id'),
  criarItemAutoRls: jest.fn().mockResolvedValue(undefined),
  removerPorRef: jest.fn().mockResolvedValue(undefined),
  atualizarHrefPorRef: jest.fn().mockResolvedValue(undefined),
});

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => 'tenant-a' },
}));

describe('SecretariasService', () => {
  let service: SecretariasService;
  let mockPrisma: ReturnType<typeof buildPrisma>;
  let mockMenus: ReturnType<typeof buildMenus>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    mockMenus = buildMenus();
    service = new SecretariasService(mockPrisma as any, mockMenus as any);
  });

  describe('listarAtivas', () => {
    it('deve filtrar somente secretarias ativas', async () => {
      await service.listarAtivas();
      expect(mockPrisma.db.secretaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ativo: true } }),
      );
    });

    it('deve ordenar por `ordem` asc', async () => {
      await service.listarAtivas();
      expect(mockPrisma.db.secretaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { ordem: 'asc' } }),
      );
    });

    it('deve incluir slug no select', async () => {
      await service.listarAtivas();
      expect(mockPrisma.db.secretaria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ slug: true }) }),
      );
    });
  });

  describe('buscarPorSlug', () => {
    it('deve retornar a secretaria ativa pelo slug', async () => {
      mockPrisma.db.secretaria.findFirst = jest.fn().mockResolvedValue(mockSecretaria);
      const result = await service.buscarPorSlug('secretaria-de-saude');
      expect(mockPrisma.db.secretaria.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ slug: 'secretaria-de-saude', ativo: true }),
        }),
      );
      expect(result).toEqual(mockSecretaria);
    });

    it('deve lançar NotFoundException se não encontrada ou inativa', async () => {
      mockPrisma.db.secretaria.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.buscarPorSlug('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('buscar', () => {
    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.db.secretaria.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.buscar('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('criar', () => {
    it('deve criar com tenantId do contexto e auditar', async () => {
      await service.criar({ nome: 'Secretaria de Obras' }, 'user-id');
      expect(mockPrisma.db.secretaria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a' }) }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'SECRETARIA_CRIADA', tenantId: 'tenant-a' }),
        }),
      );
    });

    it('deve gerar slug a partir do nome quando não fornecido', async () => {
      await service.criar({ nome: 'Secretaria de Obras' }, 'user-id');
      expect(mockPrisma.db.secretaria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'secretaria-de-obras' }),
        }),
      );
    });

    it('deve normalizar slug fornecido no DTO', async () => {
      await service.criar({ nome: 'Secretaria de Obras', slug: 'Meu Slug Customizado' }, 'user-id');
      expect(mockPrisma.db.secretaria.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'meu-slug-customizado' }),
        }),
      );
    });

    it('deve criar item de menu com href /secretarias/<slug>', async () => {
      await service.criar({ nome: 'Secretaria de Obras' }, 'user-id');
      expect(mockMenus.criarItemAutoRls).toHaveBeenCalledWith(
        expect.objectContaining({ href: '/secretarias/secretaria-de-obras' }),
      );
    });
  });

  describe('atualizar', () => {
    it('deve atualizar href do menu quando slug muda', async () => {
      mockPrisma.db.secretaria.findUnique = jest.fn().mockResolvedValue({
        ...mockSecretaria,
        slug: 'slug-antigo',
      });
      // platform().secretaria.findFirst retorna null → slug disponível
      await service.atualizar('sec-uuid-1', { slug: 'Slug Novo' }, 'user-id');
      expect(mockMenus.atualizarHrefPorRef).toHaveBeenCalledWith(
        'secretaria',
        'sec-uuid-1',
        '/secretarias/slug-novo',
      );
    });

    it('não deve alterar slug se dto.slug estiver vazio', async () => {
      await service.atualizar('sec-uuid-1', { nome: 'Novo Nome' }, 'user-id');
      expect(mockMenus.atualizarHrefPorRef).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    it('deve deletar e auditar', async () => {
      await service.excluir('sec-uuid-1', 'user-id');
      expect(mockPrisma.db.secretaria.delete).toHaveBeenCalledWith({ where: { id: 'sec-uuid-1' } });
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'SECRETARIA_EXCLUIDA' }),
        }),
      );
    });

    it('deve remover item de menu vinculado', async () => {
      await service.excluir('sec-uuid-1', 'user-id');
      expect(mockMenus.removerPorRef).toHaveBeenCalledWith('secretaria', 'sec-uuid-1');
    });
  });
});
