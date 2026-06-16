/**
 * Unit tests para IaConhecimentoService — Camada 3 da base de conhecimento do bot.
 * Testa CRUD, FTS, isolamento de tenant (RLS-mock) e auditoria.
 */
import { NotFoundException } from '@nestjs/common';
import { IaConhecimentoService } from './ia-conhecimento.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';

const mockItem = {
  id: 'item-uuid-1',
  tenantId: TENANT_A,
  pergunta: 'Como emitir certidão?',
  resposta: 'Acesse o portal de serviços.',
  tags: ['certidão', 'serviços'],
  fixado: false,
  ativo: true,
  criadoPor: 'user-uuid',
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const buildPrisma = () => ({
  db: {
    iaConhecimento: {
      findMany: jest.fn().mockResolvedValue([mockItem]),
      findUnique: jest.fn().mockResolvedValue(mockItem),
      create: jest.fn().mockResolvedValue(mockItem),
      update: jest.fn().mockResolvedValue({ ...mockItem, pergunta: 'Atualizado' }),
      delete: jest.fn().mockResolvedValue(mockItem),
      $queryRaw: jest.fn().mockResolvedValue([{ pergunta: mockItem.pergunta, resposta: mockItem.resposta }]),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    // FTS via $queryRaw no db scope
    $queryRaw: jest.fn().mockResolvedValue([{ pergunta: mockItem.pergunta, resposta: mockItem.resposta }]),
  },
});

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => TENANT_A,
    get: () => ({ userId: 'user-uuid', tenantId: TENANT_A }),
  },
}));

describe('IaConhecimentoService', () => {
  let service: IaConhecimentoService;
  let mockPrisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    service = new IaConhecimentoService(mockPrisma as any);
  });

  // ---------------------------------------------------------------------- listar
  describe('listar', () => {
    it('lista todos os itens do tenant', async () => {
      const result = await service.listar();
      expect(mockPrisma.db.iaConhecimento.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------- criar
  describe('criar', () => {
    it('cria item com tenantId do contexto e audita', async () => {
      await service.criar({ pergunta: 'Pergunta', resposta: 'Resposta' }, 'user-uuid');
      expect(mockPrisma.db.iaConhecimento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, pergunta: 'Pergunta' }),
        }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'IA_CONHECIMENTO_CRIAR' }),
        }),
      );
    });

    it('defaults: tags=[], fixado=false, ativo=true', async () => {
      await service.criar({ pergunta: 'P', resposta: 'R' }, 'user-uuid');
      const data = (mockPrisma.db.iaConhecimento.create as jest.Mock).mock.calls[0][0].data;
      expect(data.tags).toEqual([]);
      expect(data.fixado).toBe(false);
      expect(data.ativo).toBe(true);
    });
  });

  // ---------------------------------------------------------------------- atualizar
  describe('atualizar', () => {
    it('atualiza item existente e audita', async () => {
      const result = await service.atualizar('item-uuid-1', { pergunta: 'Atualizado' }, 'user-uuid');
      expect(mockPrisma.db.iaConhecimento.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-uuid-1' } }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'IA_CONHECIMENTO_ATUALIZAR' }),
        }),
      );
      expect((result as { pergunta: string }).pergunta).toBe('Atualizado');
    });

    it('lança NotFoundException para item inexistente', async () => {
      mockPrisma.db.iaConhecimento.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.atualizar('nao-existe', { pergunta: 'x' }, 'user-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------- excluir
  describe('excluir', () => {
    it('exclui item e audita', async () => {
      await service.excluir('item-uuid-1');
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'IA_CONHECIMENTO_EXCLUIR' }),
        }),
      );
      expect(mockPrisma.db.iaConhecimento.delete).toHaveBeenCalledWith({ where: { id: 'item-uuid-1' } });
    });

    it('lança NotFoundException se item não pertence ao tenant (simulado por RLS)', async () => {
      // RLS: findUnique retorna null quando o item é de outro tenant
      mockPrisma.db.iaConhecimento.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.excluir('item-tenant-b')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------- buscar (FTS)
  describe('buscar', () => {
    it('retorna [] para query vazia', async () => {
      const result = await service.buscar('');
      expect(result).toEqual([]);
      expect(mockPrisma.db.$queryRaw).not.toHaveBeenCalled();
    });

    it('chama raw FTS e retorna resultados', async () => {
      const result = await service.buscar('certidão');
      expect(result).toHaveLength(1);
      expect(result[0].pergunta).toBe(mockItem.pergunta);
    });

    it('degrada silenciosamente se raw query falhar', async () => {
      mockPrisma.db.$queryRaw = jest.fn().mockRejectedValue(new Error('DB error'));
      const result = await service.buscar('certidão');
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------- fixados
  describe('fixados', () => {
    it('filtra ativo=true e fixado=true', async () => {
      await service.fixados();
      expect(mockPrisma.db.iaConhecimento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ativo: true, fixado: true },
        }),
      );
    });

    it('degrada silenciosamente em caso de erro', async () => {
      mockPrisma.db.iaConhecimento.findMany = jest.fn().mockRejectedValue(new Error('DB'));
      const result = await service.fixados();
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------- isolamento RLS simulado
  describe('isolamento de tenant (RLS)', () => {
    it('criar sempre usa tenantId do TenantContext (nunca hardcoded)', async () => {
      await service.criar({ pergunta: 'P', resposta: 'R' }, 'user-x');
      const data = (mockPrisma.db.iaConhecimento.create as jest.Mock).mock.calls[0][0].data;
      // O tenantId vem do TenantContext mockado = TENANT_A; nunca TENANT_B
      expect(data.tenantId).toBe(TENANT_A);
      expect(data.tenantId).not.toBe(TENANT_B);
    });

    it('auditoria registra tenantId do contexto', async () => {
      await service.criar({ pergunta: 'P', resposta: 'R' });
      const auditData = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(auditData.tenantId).toBe(TENANT_A);
    });
  });
});
