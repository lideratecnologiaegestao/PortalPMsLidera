/**
 * Unit tests para CmsService — funcionalidades do construtor drag-drop (bloco 9 TR):
 *   - reordenarBlocos
 *   - salvarSnapshot / listarSnapshots / criarSnapshotManual / obterSnapshot / restaurarSnapshot
 *   - criarPagina com template
 *   - listarTemplates
 *   - paginaPublica retorna campo seo
 *
 * PrismaService e MenusService são completamente mockados (sem DB).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CmsService } from './cms.service';
import { TEMPLATES } from './cms-templates';

// ---------------------------------------------------------------------------
// Mock do TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: jest.fn(() => 'tenant-a'),
    get: jest.fn(() => ({ tenantId: 'tenant-a', userId: 'user-1' })),
  },
}));

// ---------------------------------------------------------------------------
// Mock do PrismaService

const mockTx = jest.fn();

const mockDb = {
  cmsPage: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  cmsBlock: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  },
  cmsPageSnapshot: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  db: mockDb,
  tx: mockTx,
};

const mockMenus = {
  criarItemAutoRls: jest.fn(),
  removerPorRef: jest.fn(),
};

// ---------------------------------------------------------------------------

describe('CmsService — unit', () => {
  let service: CmsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CmsService(mockPrisma as any, mockMenus as any);
    // tx executa o callback diretamente com um cliente mock
    mockTx.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockDb));
  });

  // -------------------------------------------------------------------------
  // paginaPublica — deve retornar seo
  describe('paginaPublica', () => {
    it('retorna página com campo seo', async () => {
      const fakePage = {
        id: 'p1',
        slug: 'sobre',
        titulo: 'Sobre',
        publicado: true,
        seo: { title: 'Sobre | Prefeitura', description: 'Página institucional' },
        criadoEm: new Date(),
        atualizadoEm: new Date(),
        blocks: [],
      };
      mockDb.cmsPage.findFirst.mockResolvedValueOnce(fakePage);

      const result = await service.paginaPublica('sobre');
      expect(result.seo).toEqual(fakePage.seo);
      expect(result.slug).toBe('sobre');
    });

    it('lança NotFoundException quando slug não existe', async () => {
      mockDb.cmsPage.findFirst.mockResolvedValueOnce(null);
      await expect(service.paginaPublica('nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // listarTemplates
  describe('listarTemplates', () => {
    it('retorna apenas id, nome e descricao (sem blocos)', () => {
      const lista = service.listarTemplates();
      expect(lista.length).toBe(TEMPLATES.length);
      lista.forEach((t) => {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('nome');
        expect(t).toHaveProperty('descricao');
        expect(t).not.toHaveProperty('blocos');
      });
    });

    it('inclui os 4 templates esperados', () => {
      const ids = service.listarTemplates().map((t) => t.id);
      expect(ids).toContain('institucional');
      expect(ids).toContain('servico-programa');
      expect(ids).toContain('noticia-comunicado');
      expect(ids).toContain('contato');
    });
  });

  // -------------------------------------------------------------------------
  // criarPagina com template
  describe('criarPagina com template', () => {
    const fakePage = { id: 'p-new', tenantId: 'tenant-a', slug: 'institucional', titulo: 'Página Institucional', seo: {} };
    const fakePageComBlocos = { ...fakePage, blocks: [{ id: 'b1', tipo: 'hero', ordem: 0 }] };

    it('cria página com blocos do template institucional', async () => {
      mockDb.cmsPage.create.mockResolvedValueOnce(fakePage);
      mockDb.cmsBlock.create.mockResolvedValue({ id: 'b1' });
      // paginaAdmin chamado no final ao usar template
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePageComBlocos);

      const result = await service.criarPagina({
        slug: 'institucional',
        titulo: 'Página Institucional',
        template: 'institucional',
      });

      expect(mockDb.cmsPage.create).toHaveBeenCalledTimes(1);
      // template 'institucional' tem 3 blocos
      const tmpl = TEMPLATES.find((t) => t.id === 'institucional')!;
      expect(mockDb.cmsBlock.create).toHaveBeenCalledTimes(tmpl.blocos.length);
      // primeiro bloco deve ter tipo 'hero' e ordem 0
      const primeiraChama = mockDb.cmsBlock.create.mock.calls[0][0].data;
      expect(primeiraChama.tipo).toBe('hero');
      expect(primeiraChama.ordem).toBe(0);
    });

    it('lança BadRequestException para template inválido', async () => {
      await expect(
        service.criarPagina({ slug: 'x', titulo: 'X', template: 'template-invalido' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDb.cmsPage.create).not.toHaveBeenCalled();
    });

    it('cria página sem template normalmente (retrocompat)', async () => {
      mockDb.cmsPage.create.mockResolvedValueOnce(fakePage);
      const result = await service.criarPagina({ slug: 'nova', titulo: 'Nova' });
      expect(mockDb.cmsPage.create).toHaveBeenCalledTimes(1);
      expect(mockDb.cmsBlock.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // reordenarBlocos
  describe('reordenarBlocos', () => {
    const fakePage = { id: 'p1', titulo: 'T', blocks: [] };

    it('atualiza a ordem de cada bloco em transação', async () => {
      mockDb.cmsPage.findUnique
        .mockResolvedValueOnce(fakePage) // paginaAdmin
        .mockResolvedValueOnce({ ...fakePage, blocks: [{ id: 'b1', ordem: 1 }, { id: 'b2', ordem: 0 }] }); // paginaAdmin final
      mockDb.cmsBlock.findMany.mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }]);
      mockDb.cmsBlock.update.mockResolvedValue({});

      const ordens = [
        { id: 'b1', ordem: 1 },
        { id: 'b2', ordem: 0 },
      ];
      await service.reordenarBlocos('p1', ordens);

      expect(mockTx).toHaveBeenCalledTimes(1);
      expect(mockDb.cmsBlock.update).toHaveBeenCalledTimes(2);
    });

    it('lança BadRequest se algum bloco não pertence à página', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePage); // paginaAdmin
      // findMany retorna apenas 1 de 2 blocos → inconsistência
      mockDb.cmsBlock.findMany.mockResolvedValueOnce([{ id: 'b1' }]);

      await expect(
        service.reordenarBlocos('p1', [
          { id: 'b1', ordem: 0 },
          { id: 'b-outro-tenant', ordem: 1 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('retorna página sem chamar tx quando ordens está vazio', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePage);
      // segundo findUnique para o retorno de paginaAdmin
      mockDb.cmsPage.findUnique.mockResolvedValueOnce({ ...fakePage, blocks: [] });

      await service.reordenarBlocos('p1', []);
      expect(mockTx).not.toHaveBeenCalled();
    });

    it('lança NotFoundException se página não existe', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(null);
      await expect(service.reordenarBlocos('nao-existe', [])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // listarSnapshots
  describe('listarSnapshots', () => {
    it('retorna lista de snapshots ordenada por criadoEm desc', async () => {
      const fakePage = { id: 'p1', titulo: 'T', blocks: [] };
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePage);
      const snaps = [
        { id: 's2', titulo: 'T', motivo: 'manual', criadoEm: new Date('2026-06-02'), criadoPor: 'u1' },
        { id: 's1', titulo: 'T', motivo: 'antes_de_excluir', criadoEm: new Date('2026-06-01'), criadoPor: null },
      ];
      mockDb.cmsPageSnapshot.findMany.mockResolvedValueOnce(snaps);

      const result = await service.listarSnapshots('p1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s2');
    });

    it('lança NotFoundException se página não existe', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(null);
      await expect(service.listarSnapshots('nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // criarSnapshotManual
  describe('criarSnapshotManual', () => {
    it('grava snapshot e audita CMS_SNAPSHOT_CRIADO', async () => {
      const fakePage = {
        id: 'p1', titulo: 'T', publicado: true, seo: {}, blocks: [],
      };
      // paginaAdmin (valida existência) + salvarSnapshot (carrega página)
      mockDb.cmsPage.findUnique
        .mockResolvedValueOnce(fakePage)   // paginaAdmin
        .mockResolvedValueOnce(fakePage);  // salvarSnapshot interno
      mockDb.cmsPageSnapshot.create.mockResolvedValueOnce({ id: 's-new' });
      mockDb.cmsPageSnapshot.count.mockResolvedValueOnce(1); // abaixo do limite
      mockDb.auditLog.create.mockResolvedValueOnce({});
      mockDb.cmsPageSnapshot.findFirst.mockResolvedValueOnce({
        id: 's-new', titulo: 'T', motivo: 'manual', criadoEm: new Date(), criadoPor: 'u1',
      });

      const result = await service.criarSnapshotManual('p1', 'user-1');
      expect(mockDb.cmsPageSnapshot.create).toHaveBeenCalledTimes(1);
      const dados = mockDb.cmsPageSnapshot.create.mock.calls[0][0].data;
      expect(dados.motivo).toBe('manual');
      expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
      const auditAcao = mockDb.auditLog.create.mock.calls[0][0].data.acao;
      expect(auditAcao).toBe('CMS_SNAPSHOT_CRIADO');
    });
  });

  // -------------------------------------------------------------------------
  // obterSnapshot
  describe('obterSnapshot', () => {
    it('retorna snapshot completo quando pageId bate', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce({ id: 'p1', titulo: 'T', blocks: [] });
      const snap = { id: 's1', pageId: 'p1', titulo: 'T', snapshot: { blocos: [] }, motivo: 'manual', criadoEm: new Date() };
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce(snap);

      const result = await service.obterSnapshot('p1', 's1');
      expect(result.id).toBe('s1');
      expect(result).toHaveProperty('snapshot');
    });

    it('lança NotFoundException se snapId não pertence à página', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce({ id: 'p1', titulo: 'T', blocks: [] });
      const snap = { id: 's1', pageId: 'p-outra', titulo: 'T', snapshot: {} };
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce(snap);

      await expect(service.obterSnapshot('p1', 's1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException se snapshot não existe', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce({ id: 'p1', titulo: 'T', blocks: [] });
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce(null);

      await expect(service.obterSnapshot('p1', 'nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // restaurarSnapshot
  describe('restaurarSnapshot', () => {
    const fakePage = { id: 'p1', titulo: 'Original', publicado: true, seo: {}, blocks: [] };
    const fakeSnap = {
      id: 's1',
      pageId: 'p1',
      titulo: 'Restaurada',
      motivo: 'manual',
      snapshot: {
        titulo: 'Restaurada',
        publicado: false,
        seo: { title: 'Restaurada' },
        blocos: [
          { tipo: 'texto', conteudo: { html: '<p>Olá</p>' }, ordem: 0, visivel: true },
        ],
      },
    };

    it('restaura página, recria blocos e audita CMS_PAGINA_RESTAURADA', async () => {
      // paginaAdmin + salvarSnapshot(antes_de_restaurar) + paginaAdmin final
      mockDb.cmsPage.findUnique
        .mockResolvedValueOnce(fakePage)   // paginaAdmin inicial
        .mockResolvedValueOnce(fakePage)   // salvarSnapshot interno
        .mockResolvedValueOnce({ ...fakePage, titulo: 'Restaurada', blocks: fakeSnap.snapshot.blocos }); // paginaAdmin final
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce(fakeSnap);
      mockDb.cmsPageSnapshot.create.mockResolvedValueOnce({ id: 's-pre' });
      mockDb.cmsPageSnapshot.count.mockResolvedValueOnce(1);
      mockDb.cmsPage.update.mockResolvedValueOnce({});
      mockDb.cmsBlock.deleteMany.mockResolvedValueOnce({});
      mockDb.cmsBlock.createMany.mockResolvedValueOnce({});
      mockDb.auditLog.create.mockResolvedValueOnce({});

      const result = await service.restaurarSnapshot('p1', 's1', 'user-1');

      // tx foi chamado (atualiza página + recria blocos)
      expect(mockTx).toHaveBeenCalledTimes(1);
      expect(mockDb.cmsPage.update).toHaveBeenCalledTimes(1);
      expect(mockDb.cmsBlock.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockDb.cmsBlock.createMany).toHaveBeenCalledTimes(1);

      // auditoria
      const auditAcao = mockDb.auditLog.create.mock.calls[0][0].data.acao;
      expect(auditAcao).toBe('CMS_PAGINA_RESTAURADA');
    });

    it('lança NotFoundException se snapshot não pertence à página', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePage);
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce({ ...fakeSnap, pageId: 'p-outra' });

      await expect(service.restaurarSnapshot('p1', 's1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança NotFoundException se snapshot não existe', async () => {
      mockDb.cmsPage.findUnique.mockResolvedValueOnce(fakePage);
      mockDb.cmsPageSnapshot.findUnique.mockResolvedValueOnce(null);

      await expect(service.restaurarSnapshot('p1', 'nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Limpeza de snapshots (limite MAX)
  describe('limpeza automática de snapshots', () => {
    it('exclui snapshots mais antigos quando ultrapassa 30', async () => {
      const fakePage = { id: 'p1', titulo: 'T', publicado: true, seo: {}, blocks: [] };
      // paginaAdmin + salvarSnapshot
      mockDb.cmsPage.findUnique
        .mockResolvedValueOnce(fakePage)
        .mockResolvedValueOnce(fakePage);
      mockDb.cmsPageSnapshot.create.mockResolvedValueOnce({ id: 's-new' });
      mockDb.cmsPageSnapshot.count.mockResolvedValueOnce(32); // além do limite 30
      // Os 2 mais antigos para excluir
      mockDb.cmsPageSnapshot.findMany.mockResolvedValueOnce([{ id: 'old-1' }, { id: 'old-2' }]);
      mockDb.cmsPageSnapshot.deleteMany.mockResolvedValueOnce({ count: 2 });
      mockDb.auditLog.create.mockResolvedValueOnce({});
      mockDb.cmsPageSnapshot.findFirst.mockResolvedValueOnce({
        id: 's-new', titulo: 'T', motivo: 'manual', criadoEm: new Date(), criadoPor: null,
      });

      await service.criarSnapshotManual('p1');

      expect(mockDb.cmsPageSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2'] } },
      });
    });
  });
});
