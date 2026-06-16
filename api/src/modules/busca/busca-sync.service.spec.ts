/**
 * Unit tests para BuscaSyncService.
 * Verifica: enfileiramento idempotente, strip de HTML, visibilidade pública,
 * e delegação correta de remover() quando o item não é público.
 */
import { BuscaSyncService } from './busca-sync.service';

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => 'tenant-test-uuid',
    get: () => ({ tenantId: 'tenant-test-uuid' }),
  },
}));

const buildPrisma = () => ({
  db: {
    noticia: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    documento: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    diarioMateria: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    servico: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    secretaria: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cmsPage: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    licitacao: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    contrato: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    convenio: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    conselho: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    concurso: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
  tx: jest.fn(async (fn: any) => fn({ $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([]) })),
});

const buildFila = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
});

describe('BuscaSyncService', () => {
  let service: BuscaSyncService;
  let mockPrisma: ReturnType<typeof buildPrisma>;
  let mockFila: ReturnType<typeof buildFila>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    mockFila = buildFila();
    service = new BuscaSyncService(mockPrisma as any, mockFila as any);
  });

  describe('enqueue()', () => {
    it('deve adicionar job com jobId idempotente', async () => {
      await service.enqueue('noticia', 'uuid-noticia-1');
      expect(mockFila.add).toHaveBeenCalledWith(
        'busca.sync-item',
        expect.objectContaining({ tipo: 'noticia', refId: 'uuid-noticia-1', tenantId: 'tenant-test-uuid' }),
        expect.objectContaining({ jobId: 'busca-noticia-uuid-noticia-1' }),
      );
    });

    it('não deve enfileirar sem tenantId no contexto', async () => {
      // Simula contexto sem tenant
      const { TenantContext } = require('../../common/tenant/tenant.context');
      const original = TenantContext.tenantId;
      TenantContext.tenantId = () => undefined;
      await service.enqueue('noticia', 'uuid-1');
      expect(mockFila.add).not.toHaveBeenCalled();
      TenantContext.tenantId = original;
    });
  });

  describe('processarItem() — notícia', () => {
    it('deve indexar notícia publicada', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue({
        id: 'n1', slug: 'minha-noticia', titulo: 'Minha Notícia', resumo: 'Um resumo',
        conteudo: '<p>Conteúdo</p>', publicado: true, publicadoEm: new Date(), categoria: 'Geral',
      });
      const indexarSpy = jest.spyOn(service, 'indexar').mockResolvedValue();
      await service.processarItem('noticia', 'n1');
      expect(indexarSpy).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'noticia', refId: 'n1' }));
    });

    it('deve remover notícia NÃO publicada do índice', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue({
        id: 'n2', slug: 'rascunho', titulo: 'Rascunho', publicado: false,
      });
      const removerSpy = jest.spyOn(service, 'remover').mockResolvedValue();
      await service.processarItem('noticia', 'n2');
      expect(removerSpy).toHaveBeenCalledWith('noticia', 'n2');
    });

    it('deve remover quando a notícia não existe (excluída)', async () => {
      mockPrisma.db.noticia.findUnique = jest.fn().mockResolvedValue(null);
      const removerSpy = jest.spyOn(service, 'remover').mockResolvedValue();
      await service.processarItem('noticia', 'n3');
      expect(removerSpy).toHaveBeenCalledWith('noticia', 'n3');
    });
  });

  describe('processarItem() — documento', () => {
    it('deve remover documento de cadastro restrito', async () => {
      mockPrisma.db.documento.findUnique = jest.fn().mockResolvedValue({
        id: 'd1', titulo: 'Doc Restrito', ementa: null, conteudoExtraido: null,
        ativo: true, publicadoEm: new Date(),
        cadastro: { slug: 'restricto', visibilidade: 'restrito' },
      });
      const removerSpy = jest.spyOn(service, 'remover').mockResolvedValue();
      await service.processarItem('documento', 'd1');
      expect(removerSpy).toHaveBeenCalledWith('documento', 'd1');
    });
  });

  describe('processarItem() — diário (matéria)', () => {
    it('deve remover matéria de edição não publicada', async () => {
      mockPrisma.db.diarioMateria.findUnique = jest.fn().mockResolvedValue({
        id: 'm1', titulo: 'Decreto X', ementa: null, conteudo: '', criadoEm: new Date(),
        edicao: { status: 'rascunho', publicadoEm: null },
      });
      const removerSpy = jest.spyOn(service, 'remover').mockResolvedValue();
      await service.processarItem('diario', 'm1');
      expect(removerSpy).toHaveBeenCalledWith('diario', 'm1');
    });
  });
});
