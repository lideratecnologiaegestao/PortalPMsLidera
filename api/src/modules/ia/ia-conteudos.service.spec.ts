/**
 * Unit tests para IaConteudosService.
 * Cobre: CRUD, escopo de secretaria, auditoria, indexação incremental
 * e isolamento de tenant (RLS-mock: TenantContext retorna sempre TENANT_A).
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IaConteudosService } from './ia-conteudos.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const SECRETARIA_A = 'sec-a-uuid';
const SECRETARIA_B = 'sec-b-uuid';
const ITEM_ID = 'conteudo-uuid-1';

const mockItem = {
  id: ITEM_ID,
  tenantId: TENANT_A,
  secretariaId: SECRETARIA_A,
  categoria: 'Regimentos',
  titulo: 'Regimento Interno',
  conteudo: 'Art. 1º Este regimento...',
  tags: ['regimento', 'interno'],
  publico: true,
  ativo: true,
  vigenciaInicio: null,
  vigenciaFim: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

/** Constrói mocks com estado independente por teste. */
const buildPrisma = () => ({
  db: {
    iaConteudo: {
      findMany: jest.fn().mockResolvedValue([mockItem]),
      findUnique: jest.fn().mockResolvedValue(mockItem),
      create: jest.fn().mockResolvedValue(mockItem),
      update: jest.fn().mockResolvedValue({ ...mockItem, titulo: 'Atualizado' }),
      delete: jest.fn().mockResolvedValue(mockItem),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRawUnsafe: jest.fn().mockResolvedValue([mockItem]),
    $executeRaw: jest.fn().mockResolvedValue(0),
  },
});

const buildEscopo = (retorno: string | null | undefined) => ({
  resolver: jest.fn().mockResolvedValue(retorno),
});

const buildIndexador = () => ({
  indexarConteudo: jest.fn().mockResolvedValue(undefined),
});

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => TENANT_A,
    get: () => ({ userId: 'user-uuid', tenantId: TENANT_A }),
  },
}));

// ============================================================ HELPERS

function buildService(escopoRetorno: string | null | undefined) {
  const prisma = buildPrisma();
  const escopo = buildEscopo(escopoRetorno);
  const indexador = buildIndexador();
  const service = new IaConteudosService(
    prisma as any,
    escopo as any,
    indexador as any,
  );
  return { service, prisma, escopo, indexador };
}

// ============================================================ LISTAR

describe('IaConteudosService — listar', () => {
  it('admin_prefeitura (escopo undefined) lista todos', async () => {
    const { service, prisma } = buildService(undefined);
    const result = await service.listar({}, 'user-id', 'admin_prefeitura');
    expect(prisma.db.iaConteudo.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('gestor com escopo de secretaria filtra pela secretaria', async () => {
    const { service, prisma } = buildService(SECRETARIA_A);
    await service.listar({}, 'user-id', 'gestor');
    const chamada = (prisma.db.iaConteudo.findMany as jest.Mock).mock.calls[0][0];
    expect(chamada.where.secretariaId).toBe(SECRETARIA_A);
  });

  it('gestor sem lotação (escopo null) retorna lista vazia', async () => {
    const { service } = buildService(null);
    const result = await service.listar({}, 'user-id', 'gestor');
    expect(result).toEqual([]);
  });

  it('listar com q usa FTS (queryRawUnsafe)', async () => {
    const { service, prisma } = buildService(undefined);
    await service.listar({ q: 'regimento' }, 'user-id', 'admin_prefeitura');
    expect(prisma.db.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('FTS degrada silenciosamente em erro de banco', async () => {
    const { service, prisma } = buildService(undefined);
    (prisma.db.$queryRawUnsafe as jest.Mock).mockRejectedValue(new Error('DB error'));
    const result = await service.listar({ q: 'regimento' }, 'user-id', 'admin_prefeitura');
    expect(result).toEqual([]);
  });
});

// ============================================================ OBTER

describe('IaConteudosService — obter', () => {
  it('admin obtém qualquer item', async () => {
    const { service } = buildService(undefined);
    const result = await service.obter(ITEM_ID, 'user-id', 'admin_prefeitura');
    expect(result.id).toBe(ITEM_ID);
  });

  it('gestor com escopo correto obtém o item', async () => {
    const { service } = buildService(SECRETARIA_A);
    const result = await service.obter(ITEM_ID, 'user-id', 'gestor');
    expect(result.id).toBe(ITEM_ID);
  });

  it('gestor com escopo errado lança ForbiddenException', async () => {
    const { service } = buildService(SECRETARIA_B);
    await expect(service.obter(ITEM_ID, 'user-id', 'gestor')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lança NotFoundException para item inexistente', async () => {
    const { service, prisma } = buildService(undefined);
    (prisma.db.iaConteudo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.obter('nao-existe', 'user-id', 'admin_prefeitura')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ============================================================ CRIAR

describe('IaConteudosService — criar', () => {
  it('cria item com tenantId do contexto e audita', async () => {
    const { service, prisma } = buildService(undefined);
    await service.criar({ titulo: 'T', conteudo: 'C' }, 'user-id', 'admin_prefeitura');
    expect(prisma.db.iaConteudo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, titulo: 'T' }),
      }),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'IA_CONTEUDO_CRIAR' }),
      }),
    );
  });

  it('gestor: secretariaId é forçada ao escopo (ignora DTO)', async () => {
    const { service, prisma } = buildService(SECRETARIA_A);
    await service.criar(
      { titulo: 'T', conteudo: 'C', secretariaId: SECRETARIA_B },
      'user-id',
      'gestor',
    );
    const data = (prisma.db.iaConteudo.create as jest.Mock).mock.calls[0][0].data;
    expect(data.secretariaId).toBe(SECRETARIA_A);
  });

  it('gestor sem lotação lança ForbiddenException', async () => {
    const { service } = buildService(null);
    await expect(
      service.criar({ titulo: 'T', conteudo: 'C' }, 'user-id', 'gestor'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('defaults: tags=[], publico=true, ativo=true', async () => {
    const { service, prisma } = buildService(undefined);
    await service.criar({ titulo: 'T', conteudo: 'C' }, 'user-id', 'admin_prefeitura');
    const data = (prisma.db.iaConteudo.create as jest.Mock).mock.calls[0][0].data;
    expect(data.tags).toEqual([]);
    expect(data.publico).toBe(true);
    expect(data.ativo).toBe(true);
  });

  it('dispara indexação incremental quando ativo+publico', async () => {
    const { service, indexador } = buildService(undefined);
    await service.criar({ titulo: 'T', conteudo: 'C' }, 'user-id', 'admin_prefeitura');
    // Aguarda microtasks do Promise.catch disparado de forma assíncrona
    await new Promise((r) => setImmediate(r));
    expect(indexador.indexarConteudo).toHaveBeenCalledWith(TENANT_A, mockItem.id);
  });
});

// ============================================================ ATUALIZAR

describe('IaConteudosService — atualizar', () => {
  it('atualiza item e audita', async () => {
    const { service, prisma } = buildService(undefined);
    const result = await service.atualizar(
      ITEM_ID,
      { titulo: 'Atualizado' },
      'user-id',
      'admin_prefeitura',
    );
    expect(prisma.db.iaConteudo.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ITEM_ID } }),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'IA_CONTEUDO_ATUALIZAR' }),
      }),
    );
    expect((result as { titulo: string }).titulo).toBe('Atualizado');
  });

  it('lança NotFoundException para item inexistente', async () => {
    const { service, prisma } = buildService(undefined);
    (prisma.db.iaConteudo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.atualizar('nao-existe', { titulo: 'x' }, 'user-id', 'admin_prefeitura'),
    ).rejects.toThrow(NotFoundException);
  });

  it('gestor com escopo errado lança ForbiddenException', async () => {
    const { service } = buildService(SECRETARIA_B);
    await expect(
      service.atualizar(ITEM_ID, { titulo: 'x' }, 'user-id', 'gestor'),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ============================================================ EXCLUIR

describe('IaConteudosService — excluir', () => {
  it('exclui item e audita', async () => {
    const { service, prisma } = buildService(undefined);
    await service.excluir(ITEM_ID, 'user-id', 'admin_prefeitura');
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'IA_CONTEUDO_EXCLUIR' }),
      }),
    );
    expect(prisma.db.iaConteudo.delete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
  });

  it('lança NotFoundException para item inexistente', async () => {
    const { service, prisma } = buildService(undefined);
    (prisma.db.iaConteudo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.excluir('nao-existe', 'user-id', 'admin_prefeitura'),
    ).rejects.toThrow(NotFoundException);
  });

  it('gestor com escopo errado lança ForbiddenException', async () => {
    const { service } = buildService(SECRETARIA_B);
    await expect(service.excluir(ITEM_ID, 'user-id', 'gestor')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('tenta remover chunks após exclusão (best-effort)', async () => {
    const { service, prisma } = buildService(undefined);
    await service.excluir(ITEM_ID, 'user-id', 'admin_prefeitura');
    await new Promise((r) => setImmediate(r));
    expect(prisma.db.$executeRaw).toHaveBeenCalled();
  });
});

// ============================================================ ISOLAMENTO RLS (mock)

describe('IaConteudosService — isolamento de tenant (RLS mock)', () => {
  it('criar sempre usa tenantId do TenantContext (TENANT_A, nunca TENANT_B)', async () => {
    const { service, prisma } = buildService(undefined);
    await service.criar({ titulo: 'T', conteudo: 'C' }, 'user-x', 'admin_prefeitura');
    const data = (prisma.db.iaConteudo.create as jest.Mock).mock.calls[0][0].data;
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.tenantId).not.toBe(TENANT_B);
  });

  it('auditoria registra tenantId do contexto', async () => {
    const { service, prisma } = buildService(undefined);
    await service.criar({ titulo: 'T', conteudo: 'C' }, 'user-x', 'admin_prefeitura');
    const auditData = (prisma.db.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(auditData.tenantId).toBe(TENANT_A);
  });

  it('RLS simulado: findUnique retorna null p/ item de outro tenant → NotFoundException', async () => {
    // RLS real: SELECT WHERE tenant_id = current_tenant_id() → null para outro tenant
    const { service, prisma } = buildService(undefined);
    (prisma.db.iaConteudo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.obter('item-tenant-b-id', 'user-id', 'admin_prefeitura')).rejects.toThrow(
      NotFoundException,
    );
  });
});
