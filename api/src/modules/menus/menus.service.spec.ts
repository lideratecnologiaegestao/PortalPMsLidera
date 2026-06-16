/**
 * Unit tests para MenusService.
 * Foca no comportamento em memória (montagem da árvore) e na lógica de
 * validação (ciclos, parentId errado, href obrigatório, etc.).
 * O PrismaService é completamente mockado — não há DB.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MenuLocal, MenuTipo } from '@prisma/client';
import { MenusService } from './menus.service';
import { CriarMenuItemDto, AtualizarMenuItemDto, MenuLocalEnum, MenuTipoEnum } from './menus.dto';

// ---------------------------------------------------------------------------
// Mock do PrismaService

const mockDb = {
  menuItem: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  cmsPage: {
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockPlatformDb = {
  menuItem: {
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockPrisma = {
  db: mockDb,
  platform: jest.fn(() => mockPlatformDb),
};

// ---------------------------------------------------------------------------

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: jest.fn(() => 'tenant-test-uuid'),
    get: jest.fn(() => ({ tenantId: 'tenant-test-uuid' })),
  },
}));

describe('MenusService — unit', () => {
  let service: MenusService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MenusService(mockPrisma as any);
  });

  // -------------------------------------------------------------------------
  // arvorePublica

  describe('arvorePublica', () => {
    it('monta árvore corretamente: raiz + filhos', async () => {
      const rows = [
        { id: 'r1', parentId: null, label: 'Início', tipo: 'interno' as MenuTipo, href: '/', icone: null, ordem: 0 },
        { id: 'r2', parentId: null, label: 'Ouvidoria', tipo: 'grupo' as MenuTipo, href: null, icone: null, ordem: 1 },
        { id: 'c1', parentId: 'r2', label: 'Ouvidoria Online', tipo: 'interno' as MenuTipo, href: '/ouvidoria', icone: null, ordem: 0 },
        { id: 'c2', parentId: 'r2', label: 'e-SIC', tipo: 'interno' as MenuTipo, href: '/esic', icone: null, ordem: 1 },
      ];
      mockDb.menuItem.findMany.mockResolvedValueOnce(rows);

      const arvore = await service.arvorePublica('cabecalho' as MenuLocal);

      expect(arvore).toHaveLength(2);
      expect(arvore[0].id).toBe('r1');
      expect(arvore[0].children).toHaveLength(0);
      expect(arvore[1].id).toBe('r2');
      expect(arvore[1].children).toHaveLength(2);
      expect(arvore[1].children[0].label).toBe('Ouvidoria Online');
    });

    it('retorna lista vazia se não houver itens', async () => {
      mockDb.menuItem.findMany.mockResolvedValueOnce([]);
      const arvore = await service.arvorePublica('rodape' as MenuLocal);
      expect(arvore).toHaveLength(0);
    });

    it('nó com parentId desconhecido vai para raiz (resiliência)', async () => {
      const rows = [
        { id: 'r1', parentId: 'nao-existe', label: 'Órfão', tipo: 'interno' as MenuTipo, href: '/x', icone: null, ordem: 0 },
      ];
      mockDb.menuItem.findMany.mockResolvedValueOnce(rows);
      const arvore = await service.arvorePublica('cabecalho' as MenuLocal);
      expect(arvore).toHaveLength(1);
      expect(arvore[0].id).toBe('r1');
    });
  });

  // -------------------------------------------------------------------------
  // criar

  describe('criar', () => {
    it('cria item interno com href válido', async () => {
      mockDb.menuItem.create.mockResolvedValueOnce({ id: 'new-1', label: 'X', local: 'cabecalho', tipo: 'interno' });
      mockDb.auditLog.create.mockResolvedValueOnce({});

      const dto: CriarMenuItemDto = {
        local: MenuLocalEnum.CABECALHO,
        label: 'X',
        tipo: MenuTipoEnum.INTERNO,
        href: '/x',
      };
      const resultado = await service.criar(dto, 'user-1');
      expect(mockDb.menuItem.create).toHaveBeenCalledTimes(1);
      expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
      expect(resultado.id).toBe('new-1');
    });

    it('lança BadRequest se tipo=interno sem href', async () => {
      const dto: CriarMenuItemDto = {
        local: MenuLocalEnum.CABECALHO,
        label: 'X',
        tipo: MenuTipoEnum.INTERNO,
      };
      await expect(service.criar(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('limpa href para tipo=grupo', async () => {
      mockDb.menuItem.create.mockResolvedValueOnce({ id: 'g1', label: 'Grupo', local: 'cabecalho', tipo: 'grupo' });
      mockDb.auditLog.create.mockResolvedValueOnce({});

      const dto: CriarMenuItemDto = {
        local: MenuLocalEnum.CABECALHO,
        label: 'Grupo',
        tipo: MenuTipoEnum.GRUPO,
        href: '/ignorado',
      };
      await service.criar(dto);
      // href deve ter sido apagado do dto (undefined) antes de criar
      const chamada = mockDb.menuItem.create.mock.calls[0][0];
      expect(chamada.data.href).toBeNull();
    });

    it('valida parentId inexistente → 400', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce(null); // pai não encontrado
      const dto: CriarMenuItemDto = {
        local: MenuLocalEnum.CABECALHO,
        label: 'X',
        tipo: MenuTipoEnum.INTERNO,
        href: '/x',
        parentId: 'uuid-inexistente',
      };
      await expect(service.criar(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('valida parentId de local diferente → 400', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce({ id: 'pai-1', local: 'rodape' });
      const dto: CriarMenuItemDto = {
        local: MenuLocalEnum.CABECALHO,
        label: 'X',
        tipo: MenuTipoEnum.INTERNO,
        href: '/x',
        parentId: 'pai-1',
      };
      await expect(service.criar(dto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // atualizar

  describe('atualizar', () => {
    it('atualiza campos parcialmente', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce({ id: 'i1', local: 'cabecalho' });
      mockDb.menuItem.update.mockResolvedValueOnce({ id: 'i1', label: 'Novo' });
      mockDb.auditLog.create.mockResolvedValueOnce({});

      const dto: AtualizarMenuItemDto = { label: 'Novo', ordem: 3 };
      await service.atualizar('i1', dto);

      expect(mockDb.menuItem.update).toHaveBeenCalledTimes(1);
      const campos = mockDb.menuItem.update.mock.calls[0][0].data;
      expect(campos.label).toBe('Novo');
      expect(campos.ordem).toBe(3);
    });

    it('lança NotFoundException se item não encontrado', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce(null);
      await expect(service.atualizar('nao-existe', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('impede self-referência (ciclo de si mesmo)', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce({ id: 'i1', local: 'cabecalho' });
      const dto: AtualizarMenuItemDto = { parentId: 'i1' };
      await expect(service.atualizar('i1', dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('impede ciclo: pai que é descendente do item', async () => {
      // item i1 (pai = null), filho c1 (pai = i1)
      // tentativa: definir parentId de i1 = c1 (c1 é filho de i1 → ciclo)
      mockDb.menuItem.findUnique
        .mockResolvedValueOnce({ id: 'i1', local: 'cabecalho' }) // item atual
        .mockResolvedValueOnce({ id: 'c1', local: 'cabecalho' }); // pai candidato

      // verificarDescendente: filhos de i1 = [c1]
      mockDb.menuItem.findMany.mockResolvedValueOnce([{ id: 'c1' }]);

      const dto: AtualizarMenuItemDto = { parentId: 'c1' };
      await expect(service.atualizar('i1', dto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // excluir

  describe('excluir', () => {
    it('exclui item existente', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce({ id: 'i1', label: 'X' });
      mockDb.menuItem.delete.mockResolvedValueOnce({});
      mockDb.auditLog.create.mockResolvedValueOnce({});

      const res = await service.excluir('i1', 'user-1');
      expect(res.excluido).toBe(true);
      expect(mockDb.menuItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });

    it('lança NotFoundException se item não existe', async () => {
      mockDb.menuItem.findUnique.mockResolvedValueOnce(null);
      await expect(service.excluir('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // rotasInternas

  describe('rotasInternas', () => {
    it('retorna 4 grupos com cms dinâmico', async () => {
      mockDb.cmsPage.findMany.mockResolvedValueOnce([
        { titulo: 'Sobre', slug: 'sobre' },
        { titulo: 'Contato', slug: 'contato' },
      ]);

      const grupos = await service.rotasInternas();
      expect(grupos).toHaveLength(4);
      const grupoGeral = grupos.find((g) => g.grupo === 'Geral');
      expect(grupoGeral?.rotas.some((r) => r.href === '/')).toBe(true);

      const grupoCms = grupos.find((g) => g.grupo === 'Páginas (CMS)');
      expect(grupoCms?.rotas).toHaveLength(2);
      expect(grupoCms?.rotas[0]).toEqual({ label: 'Sobre', href: '/sobre' });
    });
  });

  // -------------------------------------------------------------------------
  // removerPorRef

  describe('removerPorRef', () => {
    it('chama deleteMany com refTipo e refId', async () => {
      mockDb.menuItem.deleteMany = jest.fn().mockResolvedValueOnce({ count: 1 });
      await service.removerPorRef('secretaria', 'sec-uuid');
      expect(mockDb.menuItem.deleteMany).toHaveBeenCalledWith({
        where: { refTipo: 'secretaria', refId: 'sec-uuid' },
      });
    });
  });
});
