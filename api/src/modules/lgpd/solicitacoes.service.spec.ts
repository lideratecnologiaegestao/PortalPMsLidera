/**
 * Testes unitários do SolicitacoesService.
 * Usa stubs de PrismaService — sem banco real.
 */
import {
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SolicitacoesService } from './solicitacoes.service';
import { SolicitacaoStatus, SolicitacaoTipo } from './lgpd.dto';

// ── Stub do TenantContext ──────────────────────────────────────────────────────
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => 'tenant-aaa',
    get: () => ({ tenantId: 'tenant-aaa', userId: 'admin-id' }),
  },
}));

// ── Helper: cria stub de PrismaService ────────────────────────────────────────
function makeStub(overrides: Record<string, unknown> = {}) {
  const count = (overrides.count as jest.Mock) ?? jest.fn().mockResolvedValue(0);
  const create = (overrides.create as jest.Mock) ?? jest.fn().mockImplementation((args) => ({
    ...args.data,
    id: 'sol-uuid-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  }));
  const findMany = (overrides.findMany as jest.Mock) ?? jest.fn().mockResolvedValue([]);
  const findUnique = (overrides.findUnique as jest.Mock) ?? jest.fn().mockResolvedValue(null);
  const update = (overrides.update as jest.Mock) ?? jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const auditCreate = jest.fn().mockResolvedValue({});

  return {
    db: {
      solicitacaoTitular: { count, create, findMany, findUnique, update },
      auditLog: { create: auditCreate },
      user: { update: jest.fn() },
      userContato: { updateMany },
      diarioAlerta: { deleteMany },
      manifestacao: { updateMany },
    },
    tx: jest.fn().mockImplementation((fn) =>
      fn({
        user: { update: jest.fn().mockResolvedValue({}) },
        userContato: { updateMany },
        diarioAlerta: { deleteMany },
        manifestacao: { updateMany },
        solicitacaoTitular: { update: jest.fn().mockResolvedValue({}) },
        auditLog: { create: auditCreate },
      }),
    ),
  } as any;
}

const TITULAR_ID = 'user-titular-1';

function makeSolicitacao(overrides: Partial<{
  id: string;
  titularId: string;
  status: string;
  prazoEm: Date;
  tipo: string;
}> = {}) {
  const prazoFuturo = new Date();
  prazoFuturo.setDate(prazoFuturo.getDate() + 15);
  return {
    id: 'sol-uuid-1',
    tenantId: 'tenant-aaa',
    titularId: TITULAR_ID,
    tipo: SolicitacaoTipo.ACESSO,
    descricao: null,
    status: SolicitacaoStatus.ABERTA,
    prazoEm: prazoFuturo,
    atrasada: false,
    resposta: null,
    indeferimentoMotivo: null,
    tratadoPor: null,
    tratadoEm: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  };
}

// ── criar ─────────────────────────────────────────────────────────────────────

describe('SolicitacoesService.criar', () => {
  it('cria uma solicitação com status "aberta" e prazoEm = +15 dias', async () => {
    const criarMock = jest.fn().mockImplementation((args) => ({
      ...args.data,
      id: 'sol-uuid-1',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }));
    const prisma = makeStub({ count: jest.fn().mockResolvedValue(0), create: criarMock });
    const service = new SolicitacoesService(prisma);

    const antes = new Date();
    await service.criar(TITULAR_ID, {
      tipo: SolicitacaoTipo.ACESSO,
    });
    const depois = new Date();

    const args = criarMock.mock.calls[0][0].data;
    expect(args.status).toBe(SolicitacaoStatus.ABERTA);
    expect(args.titularId).toBe(TITULAR_ID);
    // prazoEm deve ser entre antes+14d e antes+16d (aprox. 15d)
    const diffMs = args.prazoEm.getTime() - antes.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000);
    expect(args.prazoEm.getTime()).toBeLessThanOrEqual(
      depois.getTime() + 15 * 24 * 60 * 60 * 1000 + 1000,
    );
  });

  it('lança 429 quando há 5 ou mais solicitações abertas', async () => {
    const prisma = makeStub({ count: jest.fn().mockResolvedValue(5) });
    const service = new SolicitacoesService(prisma);

    await expect(
      service.criar(TITULAR_ID, { tipo: SolicitacaoTipo.CORRECAO }),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it('audita SOLICITACAO_TITULAR_CRIADA sem conteúdo pessoal', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = makeStub({
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((args) => ({ ...args.data, id: 'sol-1', criadoEm: new Date(), atualizadoEm: new Date() })),
    });
    prisma.db.auditLog.create = auditCreate;
    const service = new SolicitacoesService(prisma);

    await service.criar(TITULAR_ID, { tipo: SolicitacaoTipo.ELIMINACAO });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'SOLICITACAO_TITULAR_CRIADA',
          dados: expect.objectContaining({ tipo: SolicitacaoTipo.ELIMINACAO }),
        }),
      }),
    );
    // Nunca inclui descricao no audit
    const dados = auditCreate.mock.calls[0][0].data.dados;
    expect(dados).not.toHaveProperty('descricao');
  });
});

// ── detalhe (cidadão) ─────────────────────────────────────────────────────────

describe('SolicitacoesService.detalhe', () => {
  it('retorna a solicitação quando pertence ao titular', async () => {
    const sol = makeSolicitacao();
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    const result = await service.detalhe(TITULAR_ID, sol.id);
    expect(result.id).toBe(sol.id);
  });

  it('lança 403 quando a solicitação pertence a outro titular', async () => {
    const sol = makeSolicitacao({ titularId: 'outro-titular-id' });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    await expect(service.detalhe(TITULAR_ID, sol.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança 404 quando não existe', async () => {
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(null) });
    const service = new SolicitacoesService(prisma);

    await expect(service.detalhe(TITULAR_ID, 'nao-existe')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── atualizarAdmin ────────────────────────────────────────────────────────────

describe('SolicitacoesService.atualizarAdmin — máquina de estados', () => {
  it('aceita transição válida aberta → em_andamento', async () => {
    const sol = makeSolicitacao({ status: SolicitacaoStatus.ABERTA });
    const updateMock = jest.fn().mockResolvedValue({ ...sol, status: SolicitacaoStatus.EM_ANDAMENTO });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol), update: updateMock });
    prisma.db.solicitacaoTitular.update = updateMock;
    const service = new SolicitacoesService(prisma);

    const result = await service.atualizarAdmin(sol.id, 'admin-id', {
      status: SolicitacaoStatus.EM_ANDAMENTO,
    });
    expect(result.status).toBe(SolicitacaoStatus.EM_ANDAMENTO);
  });

  it('lança 422 em transição inválida (concluida → aberta)', async () => {
    const sol = makeSolicitacao({ status: SolicitacaoStatus.CONCLUIDA });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    await expect(
      service.atualizarAdmin(sol.id, 'admin-id', {
        status: SolicitacaoStatus.ABERTA,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('lança 422 ao indeferir sem motivo', async () => {
    const sol = makeSolicitacao({ status: SolicitacaoStatus.EM_ANDAMENTO });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    await expect(
      service.atualizarAdmin(sol.id, 'admin-id', {
        status: SolicitacaoStatus.INDEFERIDA,
        // sem indeferimentoMotivo
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('aceita indeferimento com motivo preenchido', async () => {
    const sol = makeSolicitacao({ status: SolicitacaoStatus.EM_ANDAMENTO });
    const updateMock = jest.fn().mockResolvedValue({
      ...sol,
      status: SolicitacaoStatus.INDEFERIDA,
      indeferimentoMotivo: 'Dado não encontrado.',
    });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol), update: updateMock });
    prisma.db.solicitacaoTitular.update = updateMock;
    const service = new SolicitacoesService(prisma);

    const result = await service.atualizarAdmin(sol.id, 'admin-id', {
      status: SolicitacaoStatus.INDEFERIDA,
      indeferimentoMotivo: 'Dado não encontrado.',
    });
    expect(result.status).toBe(SolicitacaoStatus.INDEFERIDA);
  });
});

// ── campo derivado atrasada ───────────────────────────────────────────────────

describe('SolicitacoesService — campo atrasada (derivado no read)', () => {
  it('atrasada = false quando prazoEm é futuro', async () => {
    const prazoFuturo = new Date();
    prazoFuturo.setDate(prazoFuturo.getDate() + 5);
    const sol = makeSolicitacao({ prazoEm: prazoFuturo });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    const result = await service.detalhe(TITULAR_ID, sol.id);
    expect(result.atrasada).toBe(false);
  });

  it('atrasada = true quando prazoEm é passado e status é aberta', async () => {
    const prazoPassado = new Date();
    prazoPassado.setDate(prazoPassado.getDate() - 1);
    const sol = makeSolicitacao({ prazoEm: prazoPassado, status: SolicitacaoStatus.ABERTA });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    const result = await service.detalhe(TITULAR_ID, sol.id);
    expect(result.atrasada).toBe(true);
  });

  it('atrasada = false quando status é concluida (mesmo que prazo venceu)', async () => {
    const prazoPassado = new Date();
    prazoPassado.setDate(prazoPassado.getDate() - 1);
    const sol = makeSolicitacao({ prazoEm: prazoPassado, status: SolicitacaoStatus.CONCLUIDA });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(sol) });
    const service = new SolicitacoesService(prisma);

    const result = await service.detalhe(TITULAR_ID, sol.id);
    expect(result.atrasada).toBe(false);
  });
});
