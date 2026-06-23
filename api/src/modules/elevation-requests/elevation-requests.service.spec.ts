/**
 * Testes unitários — ElevationRequestsService (ADR-0005 Fase 2)
 *
 * Não acessa banco real. Usa stubs simples do PrismaService para validar:
 *  - Lógica de negócio (409 duplicata, 403 papel errado, 404 não encontrado)
 *  - Auditoria em ações sensíveis
 *  - Idempotência da expiração
 *
 * Teste de isolamento RLS (tenant A não vê tenant B) é feito no nível SQL
 * (ver db/069_elevation_requests.sql § BLOCO DE VERIFICAÇÃO) — o service
 * delega o isolamento ao RLS do banco + filtros explícitos de tenantId.
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ElevationRequestsService } from './elevation-requests.service';
import { PAPEIS_SUPER_ADMIN } from './elevation-requests.dto';

// ---- Stub mínimo do PrismaService -----------------------------------

function makePrismaStub(overrides: Record<string, any> = {}) {
  const noop = async () => undefined;
  const noopCreate = async () => ({});
  const base = {
    elevationRequest: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      create: async (args: any) => ({
        id: 'uuid-req',
        ...args.data,
        lotacaoSecretaria: null,
      }),
      update: async (args: any) => args.data,
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      update: noop,
    },
    auditLog: {
      create: noopCreate,
    },
  };

  return {
    db: { ...base, ...overrides.db },
    platform: () => ({ ...base, ...overrides.platform, $transaction: undefined }),
    tx: async (fn: (tx: any) => Promise<any>) => {
      // Simula a transação executando diretamente com o stub
      return fn({ ...base, ...overrides.tx });
    },
  };
}

// ---- Helpers --------------------------------------------------------

const TENANT_A = 'tenant-a-uuid';
const USER_A   = 'user-a-uuid';
const APROVADOR = 'aprovador-uuid';

// ---- Testes ---------------------------------------------------------

describe('ElevationRequestsService', () => {
  describe('solicitar()', () => {
    it('cria solicitação pendente quando não há duplicata', async () => {
      const prisma = makePrismaStub();
      const svc = new ElevationRequestsService(prisma as any);

      const result = await svc.solicitar(USER_A, TENANT_A, {
        papelSolicitado: 'gestor' as any,
        cargoDeclarado: 'Chefe de Gabinete',
        justificativa: 'Assumi o setor.',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('uuid-req');
    });

    it('lança 409 quando já existe pendente para o mesmo papel', async () => {
      const prisma = makePrismaStub({
        db: {
          elevationRequest: {
            findFirst: async () => ({ id: 'duplicata-uuid' }),
            create: async () => ({}),
          },
        },
      });
      const svc = new ElevationRequestsService(prisma as any);

      await expect(
        svc.solicitar(USER_A, TENANT_A, { papelSolicitado: 'gestor' as any }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('minhasSolicitacoes()', () => {
    it('retorna lista vazia quando não há solicitações', async () => {
      const prisma = makePrismaStub();
      const svc = new ElevationRequestsService(prisma as any);
      const result = await svc.minhasSolicitacoes(USER_A);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('aprovarAdmin()', () => {
    it('lança 404 quando solicitação não existe', async () => {
      const prisma = makePrismaStub();
      const svc = new ElevationRequestsService(prisma as any);
      await expect(
        svc.aprovarAdmin('id-inexistente', APROVADOR, TENANT_A),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança 403 ao tentar aprovar papel sensível (ouvidor)', async () => {
      const prisma = makePrismaStub({
        db: {
          elevationRequest: {
            findUnique: async () => ({
              id: 'uuid-req',
              userId: USER_A,
              papelSolicitado: 'ouvidor',
              status: 'pendente',
              lotacaoSecretariaId: null,
              tenantId: TENANT_A,
            }),
          },
        },
      });
      const svc = new ElevationRequestsService(prisma as any);
      await expect(
        svc.aprovarAdmin('uuid-req', APROVADOR, TENANT_A),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lança 409 quando solicitação não está pendente', async () => {
      const prisma = makePrismaStub({
        db: {
          elevationRequest: {
            findUnique: async () => ({
              id: 'uuid-req',
              userId: USER_A,
              papelSolicitado: 'gestor',
              status: 'aprovada',
              lotacaoSecretariaId: null,
              tenantId: TENANT_A,
            }),
          },
        },
      });
      const svc = new ElevationRequestsService(prisma as any);
      await expect(
        svc.aprovarAdmin('uuid-req', APROVADOR, TENANT_A),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('aprova gestor: chama update no elevation_request e no user', async () => {
      const elevationUpdate = jest.fn().mockResolvedValue({});
      const userUpdate = jest.fn().mockResolvedValue({});
      const auditCreate = jest.fn().mockResolvedValue({});

      const txStub = {
        elevationRequest: { update: elevationUpdate },
        user: { update: userUpdate },
        auditLog: { create: auditCreate },
      };

      const prisma = {
        db: {
          elevationRequest: {
            findUnique: async () => ({
              id: 'uuid-req',
              userId: USER_A,
              papelSolicitado: 'gestor',
              status: 'pendente',
              lotacaoSecretariaId: 'sec-uuid',
              tenantId: TENANT_A,
            }),
          },
        },
        tx: async (fn: (tx: any) => Promise<any>) => fn(txStub),
      };

      const svc = new ElevationRequestsService(prisma as any);
      const result = await svc.aprovarAdmin('uuid-req', APROVADOR, TENANT_A);

      expect(result).toEqual({ ok: true });
      expect(elevationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'aprovada' }) }),
      );
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'gestor', secretariaId: 'sec-uuid' }) }),
      );
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ acao: 'ELEVACAO_APROVADA' }) }),
      );
    });
  });

  describe('recusarAdmin()', () => {
    it('lança 403 ao tentar recusar papel sensível (ti)', async () => {
      const prisma = makePrismaStub({
        db: {
          elevationRequest: {
            findUnique: async () => ({
              id: 'uuid-req',
              status: 'pendente',
              papelSolicitado: 'ti',
              tenantId: TENANT_A,
              userId: USER_A,
            }),
          },
        },
      });
      const svc = new ElevationRequestsService(prisma as any);
      await expect(
        svc.recusarAdmin('uuid-req', APROVADOR, TENANT_A, 'motivo qualquer'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('aprovarSuperAdmin()', () => {
    it('lança 403 ao tentar aprovar papel não-sensível (servidor)', async () => {
      const platformFindUnique = jest.fn().mockResolvedValue({
        id: 'uuid-req',
        userId: USER_A,
        papelSolicitado: 'servidor',
        status: 'pendente',
        lotacaoSecretariaId: null,
        tenantId: TENANT_A,
      });

      const prisma = {
        platform: () => ({
          elevationRequest: { findUnique: platformFindUnique },
        }),
        tx: jest.fn(),
      };

      const svc = new ElevationRequestsService(prisma as any);
      await expect(
        svc.aprovarSuperAdmin('uuid-req', APROVADOR),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // tx não deve ser chamado
      expect(prisma.tx).not.toHaveBeenCalled();
    });

    it('PAPEIS_SUPER_ADMIN inclui ouvidor, assistente_ouvidoria, ti', () => {
      expect(PAPEIS_SUPER_ADMIN).toContain('ouvidor');
      expect(PAPEIS_SUPER_ADMIN).toContain('assistente_ouvidoria');
      expect(PAPEIS_SUPER_ADMIN).toContain('ti');
    });
  });

  describe('expirarPendentes()', () => {
    it('retorna 0 quando não há pendências expiradas', async () => {
      const prisma = makePrismaStub({
        platform: {
          elevationRequest: {
            findMany: async () => [],
            updateMany: async () => ({ count: 0 }),
          },
          auditLog: { create: async () => ({}) },
        },
      });
      const svc = new ElevationRequestsService(prisma as any);
      const n = await svc.expirarPendentes();
      expect(n).toBe(0);
    });

    it('expira e audita cada solicitação vencida', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      const auditCreate = jest.fn().mockResolvedValue({});

      const prisma = {
        platform: () => ({
          elevationRequest: {
            findMany: async () => [
              { id: 'r1', tenantId: TENANT_A, userId: USER_A, papelSolicitado: 'gestor' },
              { id: 'r2', tenantId: 'tenant-b', userId: 'user-b', papelSolicitado: 'ouvidor' },
            ],
            updateMany,
          },
          auditLog: { create: auditCreate },
        }),
      };

      const svc = new ElevationRequestsService(prisma as any);
      const n = await svc.expirarPendentes();

      expect(n).toBe(2);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'expirada' } }),
      );
      // auditado uma vez por registro
      expect(auditCreate).toHaveBeenCalledTimes(2);
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'ELEVACAO_EXPIRADA', entidadeId: 'r1' }),
        }),
      );
    });
  });
});
