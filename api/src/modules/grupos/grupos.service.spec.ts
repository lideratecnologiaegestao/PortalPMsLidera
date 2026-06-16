/**
 * Unit tests para GruposService.
 * Testa criação, atualização, exclusão, membros e validação do catálogo.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GruposService } from './grupos.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const GRUPO_ID = 'grupo-uuid-1';
const USER_ID = 'user-uuid-1';
const ATOR_ID = 'admin-uuid-1';

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => TENANT_A },
}));

const mockGrupo = {
  id: GRUPO_ID,
  tenantId: TENANT_A,
  nome: 'Editores de Conteúdo',
  descricao: null,
  permissoes: ['noticias.gerenciar', 'banners.gerenciar'],
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  membros: [],
};

const buildPrisma = () => ({
  db: {
    grupoAcesso: {
      findMany: jest.fn().mockResolvedValue([mockGrupo]),
      findUnique: jest.fn().mockResolvedValue(mockGrupo),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockGrupo),
      update: jest.fn().mockResolvedValue(mockGrupo),
      delete: jest.fn().mockResolvedValue(mockGrupo),
    },
    usuarioGrupo: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ tenantId: TENANT_A, userId: USER_ID, grupoId: GRUPO_ID }),
      delete: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
});

describe('GruposService', () => {
  let service: GruposService;
  let mockPrisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    service = new GruposService(mockPrisma as any);
  });

  describe('listar', () => {
    it('deve listar grupos com contagem de membros', async () => {
      await service.listar();
      expect(mockPrisma.db.grupoAcesso.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ _count: expect.anything() }),
        }),
      );
    });
  });

  describe('catalogo', () => {
    it('deve retornar catálogo agrupado por módulo', () => {
      const cat = service.catalogo();
      expect(cat).toHaveProperty('Notícias');
      expect(cat['Notícias']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'noticias.gerenciar' }),
        ]),
      );
      expect(cat).toHaveProperty('Usuários');
      expect(cat).toHaveProperty('Grupos');
    });
  });

  describe('criar', () => {
    it('deve criar grupo com permissões válidas e auditar', async () => {
      await service.criar(
        { nome: 'Novo Grupo', permissoes: ['noticias.gerenciar'] },
        ATOR_ID,
      );
      expect(mockPrisma.db.grupoAcesso.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, nome: 'Novo Grupo' }),
        }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'GRUPO_CRIADO' }),
        }),
      );
    });

    it('deve lançar BadRequestException para chave de permissão inválida', async () => {
      await expect(
        service.criar({ nome: 'Grupo X', permissoes: ['modulo.invalido'] }, ATOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ConflictException para nome duplicado', async () => {
      // findFirst retorna grupo existente → nome duplicado
      mockPrisma.db.grupoAcesso.findFirst = jest.fn().mockResolvedValue(mockGrupo);
      await expect(
        service.criar({ nome: 'Editores de Conteúdo', permissoes: [] }, ATOR_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('atualizar', () => {
    it('deve auditar com GRUPO_ATUALIZADO', async () => {
      await service.atualizar(GRUPO_ID, { nome: 'Novo Nome' }, ATOR_ID);
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'GRUPO_ATUALIZADO' }),
        }),
      );
    });

    it('deve rejeitar permissão inválida ao atualizar', async () => {
      await expect(
        service.atualizar(GRUPO_ID, { permissoes: ['hack.acesso'] }, ATOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException para grupo inexistente', async () => {
      mockPrisma.db.grupoAcesso.findUnique = jest.fn().mockResolvedValue(null);
      await expect(
        service.atualizar('id-nao-existe', { nome: 'X' }, ATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('excluir', () => {
    it('deve excluir e auditar com GRUPO_EXCLUIDO', async () => {
      await service.excluir(GRUPO_ID, ATOR_ID);
      expect(mockPrisma.db.grupoAcesso.delete).toHaveBeenCalledWith({ where: { id: GRUPO_ID } });
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'GRUPO_EXCLUIDO' }),
        }),
      );
    });
  });

  describe('adicionarMembro', () => {
    it('deve adicionar membro e auditar com GRUPO_MEMBRO_ADD', async () => {
      await service.adicionarMembro(GRUPO_ID, USER_ID, ATOR_ID);
      expect(mockPrisma.db.usuarioGrupo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: USER_ID, grupoId: GRUPO_ID, tenantId: TENANT_A }),
        }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'GRUPO_MEMBRO_ADD' }),
        }),
      );
    });

    it('deve ser idempotente: silenciar erro P2002 (membro duplicado)', async () => {
      const err: any = new Error('unique constraint');
      err.code = 'P2002';
      mockPrisma.db.usuarioGrupo.create = jest.fn().mockRejectedValue(err);
      await expect(service.adicionarMembro(GRUPO_ID, USER_ID, ATOR_ID)).resolves.toEqual(
        { adicionado: true },
      );
    });
  });

  describe('removerMembro', () => {
    it('deve lançar NotFoundException se usuário não é membro', async () => {
      mockPrisma.db.usuarioGrupo.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.removerMembro(GRUPO_ID, USER_ID, ATOR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve remover e auditar com GRUPO_MEMBRO_REMOVE', async () => {
      mockPrisma.db.usuarioGrupo.findUnique = jest.fn().mockResolvedValue({ userId: USER_ID, grupoId: GRUPO_ID });
      await service.removerMembro(GRUPO_ID, USER_ID, ATOR_ID);
      expect(mockPrisma.db.usuarioGrupo.delete).toHaveBeenCalled();
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'GRUPO_MEMBRO_REMOVE' }),
        }),
      );
    });
  });

  describe('Isolamento RLS (tenant A não acessa dados de tenant B)', () => {
    it('deve usar tenantId do contexto (tenant A) ao criar — nunca tenant B', async () => {
      // O TenantContext sempre retorna TENANT_A; qualquer gravação deve usar TENANT_A
      await service.criar({ nome: 'Grupo Tenant A', permissoes: [] }, ATOR_ID);
      const chamada = (mockPrisma.db.grupoAcesso.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.tenantId).toBe(TENANT_A);
      expect(chamada.data.tenantId).not.toBe(TENANT_B);
    });

    it('deve passar tenantId correto ao adicionar membro', async () => {
      await service.adicionarMembro(GRUPO_ID, USER_ID, ATOR_ID);
      const chamada = (mockPrisma.db.usuarioGrupo.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.tenantId).toBe(TENANT_A);
      expect(chamada.data.tenantId).not.toBe(TENANT_B);
    });

    it('deve passar tenantId correto em todos os audit_logs', async () => {
      await service.criar({ nome: 'G', permissoes: [] }, ATOR_ID);
      const auditChamada = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(auditChamada.data.tenantId).toBe(TENANT_A);
    });
  });
});
