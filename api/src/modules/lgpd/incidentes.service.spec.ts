/**
 * Testes unitários do IncidentesService.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IncidentesService } from './incidentes.service';
import { IncidenteCategoria, IncidenteSeveridade, IncidenteStatus } from './lgpd.dto';

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => 'tenant-bbb',
    get: () => ({ tenantId: 'tenant-bbb' }),
  },
}));

function makeStub(overrides: Record<string, unknown> = {}) {
  const create = (overrides.create as jest.Mock) ?? jest.fn().mockImplementation((args) => ({
    ...args.data,
    id: 'inc-uuid-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  }));
  const findUnique = (overrides.findUnique as jest.Mock) ?? jest.fn().mockResolvedValue(null);
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const update = (overrides.update as jest.Mock) ?? jest.fn().mockResolvedValue({});
  const auditCreate = jest.fn().mockResolvedValue({});

  return {
    db: {
      incidenteSeguranca: { create, findUnique, findMany, count, update },
      auditLog: { create: auditCreate },
    },
  } as any;
}

function makeIncidente(overrides: Partial<{
  id: string;
  status: string;
  severidade: string;
  prazoComunicacaoEm: Date;
  medidasContencao: string | null;
  riscoDescricao: string | null;
  comunicadoAnpd: boolean;
  comunicadoTitulares: boolean;
}> = {}) {
  const prazoFuturo = new Date();
  prazoFuturo.setDate(prazoFuturo.getDate() + 5);
  return {
    id: 'inc-uuid-1',
    tenantId: 'tenant-bbb',
    titulo: 'Incidente de teste',
    descricao: 'Descrição do incidente.',
    categoria: IncidenteCategoria.ACESSO_INDEVIDO,
    severidade: IncidenteSeveridade.MEDIA,
    dadosAfetados: ['nome', 'email'],
    titularesAfetadosEstimados: 50,
    status: IncidenteStatus.REGISTRADO,
    prazoComunicacaoEm: prazoFuturo,
    comunicacaoAtrasada: false,
    comunicadoAnpd: false,
    comunicadoTitulares: false,
    medidasContencao: null,
    riscoDescricao: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  };
}

// ── criar ─────────────────────────────────────────────────────────────────────

describe('IncidentesService.criar', () => {
  it('calcula prazo de 2 dias para severidade critica', async () => {
    const createMock = jest.fn().mockImplementation((args) => ({
      ...args.data,
      id: 'inc-1',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }));
    const prisma = makeStub({ create: createMock });
    const service = new IncidentesService(prisma);

    const detectadoEm = new Date('2026-06-10T08:00:00Z');
    await service.criar('admin-id', {
      titulo: 'Teste',
      descricao: 'Desc',
      categoria: IncidenteCategoria.VAZAMENTO,
      severidade: IncidenteSeveridade.CRITICA,
      dadosAfetados: ['email'],
      detectadoEm: detectadoEm.toISOString(),
    });

    const args = createMock.mock.calls[0][0].data;
    const diff = args.prazoComunicacaoEm.getTime() - detectadoEm.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('calcula prazo de 2 dias para dado sensível (cpf) com severidade baixa', async () => {
    const createMock = jest.fn().mockImplementation((args) => ({
      ...args.data,
      id: 'inc-2',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }));
    const prisma = makeStub({ create: createMock });
    const service = new IncidentesService(prisma);

    const detectadoEm = new Date('2026-06-10T08:00:00Z');
    await service.criar('admin-id', {
      titulo: 'Vazamento CPF',
      descricao: 'Desc',
      categoria: IncidenteCategoria.PERDA,
      severidade: IncidenteSeveridade.BAIXA,
      dadosAfetados: ['cpf', 'nome'],
      detectadoEm: detectadoEm.toISOString(),
    });

    const args = createMock.mock.calls[0][0].data;
    const diff = args.prazoComunicacaoEm.getTime() - detectadoEm.getTime();
    expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('calcula prazo de 5 dias para media sem dado sensível', async () => {
    const createMock = jest.fn().mockImplementation((args) => ({
      ...args.data,
      id: 'inc-3',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }));
    const prisma = makeStub({ create: createMock });
    const service = new IncidentesService(prisma);

    const detectadoEm = new Date('2026-06-10T08:00:00Z');
    await service.criar('admin-id', {
      titulo: 'Incidente leve',
      descricao: 'Desc',
      categoria: IncidenteCategoria.INDISPONIBILIDADE,
      severidade: IncidenteSeveridade.MEDIA,
      dadosAfetados: ['nome', 'email'],
      detectadoEm: detectadoEm.toISOString(),
    });

    const args = createMock.mock.calls[0][0].data;
    const diff = args.prazoComunicacaoEm.getTime() - detectadoEm.getTime();
    expect(diff).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it('status inicial é "registrado"', async () => {
    const createMock = jest.fn().mockImplementation((args) => ({
      ...args.data,
      id: 'inc-4',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    }));
    const prisma = makeStub({ create: createMock });
    const service = new IncidentesService(prisma);

    await service.criar('admin-id', {
      titulo: 'T',
      descricao: 'D',
      categoria: IncidenteCategoria.OUTRO,
      severidade: IncidenteSeveridade.BAIXA,
      dadosAfetados: [],
    });

    expect(createMock.mock.calls[0][0].data.status).toBe(IncidenteStatus.REGISTRADO);
  });
});

// ── atualizar — máquina de estados ────────────────────────────────────────────

describe('IncidentesService.atualizar — FSM', () => {
  it('lança 422 em transição inválida (registrado → comunicado)', async () => {
    const inc = makeIncidente({ status: IncidenteStatus.REGISTRADO });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(inc) });
    const service = new IncidentesService(prisma);

    await expect(
      service.atualizar(inc.id, 'admin-id', { status: IncidenteStatus.COMUNICADO }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('lança 422 ao encerrar baixa sem medidasContencao', async () => {
    const inc = makeIncidente({
      status: IncidenteStatus.EM_AVALIACAO,
      severidade: IncidenteSeveridade.BAIXA,
      medidasContencao: null,
      riscoDescricao: 'Risco baixo',
    });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(inc) });
    const service = new IncidentesService(prisma);

    await expect(
      service.atualizar(inc.id, 'admin-id', { status: IncidenteStatus.ENCERRADO }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('aceita encerrar alta diretamente para encerrado (com comunicado)', async () => {
    const inc = makeIncidente({
      status: IncidenteStatus.COMUNICADO,
      severidade: IncidenteSeveridade.ALTA,
      medidasContencao: 'Feito patch',
      riscoDescricao: 'Risco alto',
    });
    const updateMock = jest.fn().mockResolvedValue({
      ...inc,
      status: IncidenteStatus.ENCERRADO,
    });
    const prisma = makeStub({
      findUnique: jest.fn().mockResolvedValue(inc),
      update: updateMock,
    });
    prisma.db.incidenteSeguranca.update = updateMock;
    const service = new IncidentesService(prisma);

    const result = await service.atualizar(inc.id, 'admin-id', {
      status: IncidenteStatus.ENCERRADO,
    });
    expect(result.status).toBe(IncidenteStatus.ENCERRADO);
  });

  it('audita INCIDENTE_COMUNICADO_ANPD ao setar comunicadoAnpd=true pela 1ª vez', async () => {
    const inc = makeIncidente({
      status: IncidenteStatus.EM_CONTENCAO,
      comunicadoAnpd: false,
    });
    const updateMock = jest.fn().mockResolvedValue({
      ...inc,
      status: IncidenteStatus.COMUNICADO,
      comunicadoAnpd: true,
    });
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = makeStub({
      findUnique: jest.fn().mockResolvedValue(inc),
      update: updateMock,
    });
    prisma.db.incidenteSeguranca.update = updateMock;
    prisma.db.auditLog.create = auditCreate;
    const service = new IncidentesService(prisma);

    await service.atualizar(inc.id, 'admin-id', {
      status: IncidenteStatus.COMUNICADO,
      comunicadoAnpd: true,
    });

    const acoes = auditCreate.mock.calls.map((c) => c[0].data.acao);
    expect(acoes).toContain('INCIDENTE_COMUNICADO_ANPD');
    expect(acoes).toContain('INCIDENTE_STATUS_ATUALIZADO');
  });
});

// ── campo comunicacaoAtrasada (derivado) ──────────────────────────────────────

describe('IncidentesService — comunicacaoAtrasada (derivado)', () => {
  it('comunicacaoAtrasada = false quando prazo é futuro', async () => {
    const prazoFuturo = new Date();
    prazoFuturo.setDate(prazoFuturo.getDate() + 2);
    const inc = makeIncidente({ prazoComunicacaoEm: prazoFuturo });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(inc) });
    const service = new IncidentesService(prisma);

    const result = await service.detalhe(inc.id);
    expect(result.comunicacaoAtrasada).toBe(false);
  });

  it('comunicacaoAtrasada = true quando prazo venceu e status não encerrado', async () => {
    const prazoPassado = new Date();
    prazoPassado.setDate(prazoPassado.getDate() - 1);
    const inc = makeIncidente({
      prazoComunicacaoEm: prazoPassado,
      status: IncidenteStatus.EM_AVALIACAO,
    });
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(inc) });
    const service = new IncidentesService(prisma);

    const result = await service.detalhe(inc.id);
    expect(result.comunicacaoAtrasada).toBe(true);
  });
});

// ── relatorio ─────────────────────────────────────────────────────────────────

describe('IncidentesService.relatorio', () => {
  it('lança 404 para incidente inexistente', async () => {
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(null) });
    const service = new IncidentesService(prisma);

    await expect(service.relatorio('nao-existe', 'admin-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('registra auditoria INCIDENTE_RELATORIO_EXPORTADO', async () => {
    const inc = makeIncidente();
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = makeStub({ findUnique: jest.fn().mockResolvedValue(inc) });
    prisma.db.auditLog.create = auditCreate;
    const service = new IncidentesService(prisma);

    await service.relatorio(inc.id, 'admin-id');

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'INCIDENTE_RELATORIO_EXPORTADO',
          dados: expect.objectContaining({ exportadoPor: 'admin-id' }),
        }),
      }),
    );
  });
});
