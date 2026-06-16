/**
 * Unit tests para SessionsService.
 * Testa registro, verificação, revogação e isolamento RLS.
 */

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const JTI = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = 'user-uuid-1';
const EXPIRA_EM = new Date(Date.now() + 8 * 3600 * 1000);

// Mock do Redis (redisConnection singleton)
const mockRedis: Record<string, jest.Mock> = {
  set: jest.fn().mockResolvedValue('OK'),
  exists: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
};

jest.mock('../queue/redis.config', () => ({
  redisConnection: {
    set: (...a: any[]) => mockRedis.set(...a),
    exists: (...a: any[]) => mockRedis.exists(...a),
    del: (...a: any[]) => mockRedis.del(...a),
  },
}));

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => TENANT_A },
}));

import { SessionsService } from './sessions.service';

const mockSessao = {
  id: JTI,
  tenantId: TENANT_A,
  userId: USER_ID,
  ip: '1.2.3.4',
  userAgent: 'jest-test',
  criadoEm: new Date(),
  ultimaAtividadeEm: new Date(),
  expiraEm: EXPIRA_EM,
  revogadoEm: null,
  user: { id: USER_ID, nome: 'Teste', email: 'teste@pref.br', role: 'admin_prefeitura' },
};

const buildPrisma = () => ({
  db: {
    userSession: {
      create: jest.fn().mockResolvedValue(mockSessao),
      findMany: jest.fn().mockResolvedValue([mockSessao]),
      findFirst: jest.fn().mockResolvedValue(mockSessao),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
  platform: jest.fn().mockReturnValue({
    userSession: {
      create: jest.fn().mockResolvedValue(mockSessao),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([mockSessao]),
      findFirst: jest.fn().mockResolvedValue(mockSessao),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ nome: 'Prefeitura Teste' }),
    },
  }),
});

describe('SessionsService', () => {
  let service: SessionsService;
  let mockPrisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = buildPrisma();
    service = new SessionsService(mockPrisma as any);
  });

  // --------------------------------------------------------------- registrar
  describe('registrar', () => {
    it('deve gravar no banco (prisma.db) e no Redis quando tenantId existe', async () => {
      await service.registrar(JTI, { userId: USER_ID, tenantId: TENANT_A, ip: '1.2.3.4', userAgent: 'ua', expiraEm: EXPIRA_EM });
      expect(mockPrisma.db.userSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: JTI, userId: USER_ID }) }),
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(JTI), '1', 'EX', expect.any(Number),
      );
    });

    it('deve usar platform() para super_admin (tenantId = null)', async () => {
      await service.registrar(JTI, { userId: USER_ID, tenantId: null, expiraEm: EXPIRA_EM });
      expect(mockPrisma.platform).toHaveBeenCalled();
      expect(mockPrisma.db.userSession.create).not.toHaveBeenCalled();
    });

    it('deve absorver erro de banco sem lançar (best-effort no login)', async () => {
      mockPrisma.db.userSession.create = jest.fn().mockRejectedValue(new Error('DB offline'));
      await expect(
        service.registrar(JTI, { userId: USER_ID, tenantId: TENANT_A, expiraEm: EXPIRA_EM }),
      ).resolves.toBeUndefined();
    });

    it('deve absorver erro de Redis sem lançar', async () => {
      mockRedis.set = jest.fn().mockRejectedValue(new Error('Redis offline'));
      await expect(
        service.registrar(JTI, { userId: USER_ID, tenantId: TENANT_A, expiraEm: EXPIRA_EM }),
      ).resolves.toBeUndefined();
    });

    it('deve normalizar IPv4-mapeado em IPv6 (::ffff:1.2.3.4 → 1.2.3.4)', async () => {
      await service.registrar(JTI, { userId: USER_ID, tenantId: TENANT_A, ip: '::ffff:1.2.3.4', expiraEm: EXPIRA_EM });
      expect(mockPrisma.db.userSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ip: '1.2.3.4' }) }),
      );
    });
  });

  // --------------------------------------------------------------- estaAtiva
  describe('estaAtiva', () => {
    it('deve retornar true quando a chave Redis existe', async () => {
      mockRedis.exists = jest.fn().mockResolvedValue(1);
      expect(await service.estaAtiva(JTI)).toBe(true);
    });

    it('deve retornar false quando a chave Redis nao existe (revogada)', async () => {
      mockRedis.exists = jest.fn().mockResolvedValue(0);
      expect(await service.estaAtiva(JTI)).toBe(false);
    });

    it('deve retornar null (fail-open) quando Redis lança erro', async () => {
      mockRedis.exists = jest.fn().mockRejectedValue(new Error('Redis offline'));
      expect(await service.estaAtiva(JTI)).toBeNull();
    });
  });

  // ---------------------------------------------------------------- revogar
  describe('revogar', () => {
    it('deve atualizar o banco e deletar a chave Redis', async () => {
      await service.revogar(JTI, USER_ID, TENANT_A);
      expect(mockPrisma.db.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: JTI }) }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining(JTI));
    });

    it('deve tolerar falha de banco sem lançar', async () => {
      mockPrisma.db.userSession.updateMany = jest.fn().mockRejectedValue(new Error('DB offline'));
      await expect(service.revogar(JTI, USER_ID, TENANT_A)).resolves.toBeUndefined();
    });

    it('deve tolerar falha de Redis sem lançar', async () => {
      mockRedis.del = jest.fn().mockRejectedValue(new Error('Redis offline'));
      await expect(service.revogar(JTI, USER_ID, TENANT_A)).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------- revogarMinha
  describe('revogarMinha', () => {
    it('deve chamar revogar quando a sessao pertence ao usuario', async () => {
      mockPrisma.db.userSession.findFirst = jest.fn().mockResolvedValue({ id: JTI });
      const revogarSpy = jest.spyOn(service, 'revogar').mockResolvedValue();
      await service.revogarMinha(JTI, USER_ID, TENANT_A);
      expect(revogarSpy).toHaveBeenCalledWith(JTI, USER_ID, TENANT_A);
    });

    it('deve ser silencioso quando sessao nao pertence ao usuario (segurança)', async () => {
      mockPrisma.db.userSession.findFirst = jest.fn().mockResolvedValue(null);
      const revogarSpy = jest.spyOn(service, 'revogar').mockResolvedValue();
      await service.revogarMinha(JTI, 'outro-user', TENANT_A);
      expect(revogarSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------- Isolamento RLS
  describe('Isolamento RLS (tenant A nao ve dados de tenant B)', () => {
    it('deve usar prisma.db (RLS) para operacoes de tenant-scoped', async () => {
      await service.registrar(JTI, { userId: USER_ID, tenantId: TENANT_A, expiraEm: EXPIRA_EM });
      // prisma.db e chamado, nao platform()
      expect(mockPrisma.db.userSession.create).toHaveBeenCalled();
      expect(mockPrisma.platform).not.toHaveBeenCalled();
    });

    it('deve usar platform() para sessoes de super_admin (tenantId null)', async () => {
      await service.registrar(JTI, { userId: USER_ID, tenantId: null, expiraEm: EXPIRA_EM });
      expect(mockPrisma.platform).toHaveBeenCalled();
      expect(mockPrisma.db.userSession.create).not.toHaveBeenCalled();
    });

    it('listarAtivas deve usar prisma.db com RLS (sem chamada ao platform)', async () => {
      // Simula sessoes com usuario incluido
      mockPrisma.db.userSession.findMany = jest.fn().mockResolvedValue([mockSessao]);
      mockRedis.exists = jest.fn().mockResolvedValue(0);
      const result = await service.listarAtivas(TENANT_A);
      expect(mockPrisma.db.userSession.findMany).toHaveBeenCalled();
      expect(mockPrisma.platform).not.toHaveBeenCalled();
      expect(result[0].userId).toBe(USER_ID);
    });
  });

  // ------------------------------------------------------------ heartbeat
  describe('heartbeat', () => {
    it('deve atualizar presenca online no Redis sem lançar', async () => {
      mockRedis.exists = jest.fn().mockResolvedValue(0);
      await expect(service.heartbeat(JTI, USER_ID, TENANT_A)).resolves.toBeUndefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(`ponline:${TENANT_A}:${USER_ID}`),
        '1',
        'EX',
        300,
      );
    });

    it('deve tolerar falha total de Redis sem lançar', async () => {
      mockRedis.set = jest.fn().mockRejectedValue(new Error('Redis offline'));
      await expect(service.heartbeat(JTI, USER_ID, TENANT_A)).resolves.toBeUndefined();
    });
  });
});
