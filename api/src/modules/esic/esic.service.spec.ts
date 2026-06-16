/**
 * Unit tests — EsicService
 *
 * Cobre:
 *  A) Resposta NÃO contém campos pessoais do solicitante (LGPD)
 *  B) Agregação correta (total, por status, série mensal, tempo médio, % no prazo)
 *  C) Isolamento RLS — leitura sempre via this.prisma.db (nunca platform())
 */

import { EsicService } from './esic.service';

// ─── fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000000';

const mockSolicitacoes = [
  {
    protocolo: '2024000001',
    assunto: 'Orçamento Municipal 2024',
    tipo: 'acesso_informacao',
    status: 'respondida',
    criadoEm: new Date('2024-01-10T10:00:00Z'),
    respondidoEm: new Date('2024-01-25T15:00:00Z'),
    prorrogado: false,
    // Estes campos NÃO devem aparecer na resposta:
    solicitanteNome: 'João da Silva',
    solicitanteEmail: 'joao@example.com',
    cidadaoId: 'cidadao-uuid-1',
    chaveHash: 'abc123',
    descricao: 'Preciso de informação sobre o orçamento',
  },
  {
    protocolo: '2024000002',
    assunto: 'Contrato de limpeza urbana',
    tipo: 'acesso_informacao',
    status: 'em_analise',
    criadoEm: new Date('2024-02-05T09:00:00Z'),
    respondidoEm: null,
    prorrogado: false,
    solicitanteNome: 'Maria Souza',
    solicitanteEmail: 'maria@example.com',
    cidadaoId: 'cidadao-uuid-2',
    chaveHash: 'def456',
    descricao: 'Solicito o contrato completo',
  },
];

// ─── mock TenantContext ───────────────────────────────────────────────────────

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => TENANT_A,
    get: () => ({ tenantId: TENANT_A }),
  },
}));

// ─── builders ────────────────────────────────────────────────────────────────

const buildPrisma = () => ({
  db: {
    manifestacao: {
      count: jest.fn().mockResolvedValue(10),
      groupBy: jest.fn().mockResolvedValue([
        { status: 'respondida', _count: { _all: 5 } },
        { status: 'em_analise', _count: { _all: 3 } },
        { status: 'concluida', _count: { _all: 2 } },
      ]),
      findMany: jest.fn().mockResolvedValue(
        // Retorna somente os campos que o service projeta (sem PII)
        mockSolicitacoes.map(({ protocolo, assunto, tipo, status, criadoEm, respondidoEm, prorrogado }) => ({
          protocolo, assunto, tipo, status, criadoEm, respondidoEm, prorrogado,
        })),
      ),
      $queryRaw: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
});

// Mock específico para $queryRaw encadeado
const buildPrismaWithQueryRaw = () => {
  const serieMensal = [{ mes: '2024-01', total: BigInt(3) }, { mes: '2024-02', total: BigInt(7) }];
  const tempoMedio = [{ dias: 12.5 }];
  const prazoStats = [{ no_prazo: BigInt(4), respondidas: BigInt(5) }];

  const queryRawMock = jest
    .fn()
    .mockResolvedValueOnce(serieMensal)  // 1ª chamada: serieMensal
    .mockResolvedValueOnce(tempoMedio)   // 2ª chamada: tempoMedio
    .mockResolvedValueOnce(prazoStats);  // 3ª chamada: prazoStats

  return {
    db: {
      manifestacao: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'respondida', _count: { _all: 5 } },
          { status: 'em_analise', _count: { _all: 3 } },
          { status: 'concluida', _count: { _all: 2 } },
        ]),
        findMany: jest.fn().mockResolvedValue(
          mockSolicitacoes.map(({ protocolo, assunto, tipo, status, criadoEm, respondidoEm, prorrogado }) => ({
            protocolo, assunto, tipo, status, criadoEm, respondidoEm, prorrogado,
          })),
        ),
      },
      $queryRaw: queryRawMock,
    },
  };
};

// ─── A) Campos pessoais NÃO devem aparecer ───────────────────────────────────

describe('A) LGPD — resposta não contém campos pessoais', () => {
  it('ultimasSolicitacoes não deve conter solicitanteNome', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    for (const item of result.ultimasSolicitacoes) {
      expect(item).not.toHaveProperty('solicitanteNome');
      expect(item).not.toHaveProperty('solicitanteEmail');
      expect(item).not.toHaveProperty('cidadaoId');
      expect(item).not.toHaveProperty('chaveHash');
      expect(item).not.toHaveProperty('descricao');
    }
  });

  it('ultimasSolicitacoes deve conter somente campos não-pessoais', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.ultimasSolicitacoes).toHaveLength(2);
    const item = result.ultimasSolicitacoes[0];

    // Campos permitidos
    expect(item).toHaveProperty('protocolo');
    expect(item).toHaveProperty('assunto');
    expect(item).toHaveProperty('tipo');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('abertoEm');
    expect(item).toHaveProperty('respondidoEm');
    expect(item).toHaveProperty('prorrogado');

    // Garante que nenhum campo extra inesperado vazou
    const keysPermitidas = ['protocolo', 'assunto', 'tipo', 'status', 'abertoEm', 'respondidoEm', 'prorrogado'];
    const keysRetornadas = Object.keys(item);
    expect(keysRetornadas.sort()).toEqual(keysPermitidas.sort());
  });

  it('o select do findMany não deve incluir campos pessoais', () => {
    /**
     * Valida que o source code do service não seleciona campos PII.
     * Complementa os testes de runtime — garante que uma refatoração não
     * reintroduza vazamento por acidente.
     */
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'esic.service.ts'),
      'utf-8',
    );

    // Campos pessoais NÃO devem aparecer no select do findMany
    expect(source).not.toMatch(/select:[\s\S]{0,500}solicitanteNome/);
    expect(source).not.toMatch(/select:[\s\S]{0,500}solicitanteEmail/);
    expect(source).not.toMatch(/select:[\s\S]{0,500}cidadaoId/);
    expect(source).not.toMatch(/select:[\s\S]{0,500}chaveHash/);
    expect(source).not.toMatch(/select:[\s\S]{0,500}descricao/);

    // Campos não-pessoais devem estar presentes
    expect(source).toContain('protocolo: true');
    expect(source).toContain('assunto: true');
    expect(source).toContain('status: true');
    expect(source).toContain('criadoEm: true');
  });
});

// ─── B) Agregação correta ─────────────────────────────────────────────────────

describe('B) Agregação correta', () => {
  it('deve retornar total, abertos e respondidas corretamente', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.total).toBe(10);
    // abertos = status em_analise (3)
    expect(result.abertos).toBe(3);
    // respondidas vem do prazoStats[0].respondidas = BigInt(5) → 5
    expect(result.respondidas).toBe(5);
  });

  it('deve calcular taxaResposta corretamente', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    // 5 respondidas / 10 total = 50%
    expect(result.taxaResposta).toBe(50);
  });

  it('deve calcular taxaNoPrazo corretamente', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    // 4 no_prazo / 5 respondidas = 80%
    expect(result.taxaNoPrazo).toBe(80);
  });

  it('deve retornar tempoMedioDias como número', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.tempoMedioDias).toBe(12.5);
  });

  it('deve mapear serieMensal convertendo BigInt para number', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.serieMensal).toHaveLength(2);
    expect(result.serieMensal[0]).toEqual({ mes: '2024-01', total: 3 });
    expect(result.serieMensal[1]).toEqual({ mes: '2024-02', total: 7 });
    // Garante que não são BigInt (seria um problema na serialização JSON)
    expect(typeof result.serieMensal[0].total).toBe('number');
  });

  it('deve retornar taxaNoPrazo null quando não há respondidas', async () => {
    const queryRawMock = jest
      .fn()
      .mockResolvedValueOnce([]) // serieMensal vazia
      .mockResolvedValueOnce([{ dias: null }]) // sem tempo médio
      .mockResolvedValueOnce([{ no_prazo: BigInt(0), respondidas: BigInt(0) }]); // zero respondidas

    const prisma = {
      db: {
        manifestacao: {
          count: jest.fn().mockResolvedValue(3),
          groupBy: jest.fn().mockResolvedValue([{ status: 'em_analise', _count: { _all: 3 } }]),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $queryRaw: queryRawMock,
      },
    };
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.taxaNoPrazo).toBeNull();
    expect(result.tempoMedioDias).toBeNull();
  });

  it('deve filtrar manifestações pelo canal esic', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    await service.estatisticas();

    // count deve passar where: { canal: 'esic' }
    expect(prisma.db.manifestacao.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ canal: 'esic' }) }),
    );
    // groupBy também deve filtrar por canal esic
    expect(prisma.db.manifestacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ canal: 'esic' }) }),
    );
    // findMany também
    expect(prisma.db.manifestacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ canal: 'esic' }) }),
    );
  });

  it('deve incluir geradoEm como string ISO', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(typeof result.geradoEm).toBe('string');
    expect(new Date(result.geradoEm).toISOString()).toBe(result.geradoEm);
  });
});

// ─── C) Isolamento RLS ────────────────────────────────────────────────────────

describe('C) Isolamento RLS — tenant A não acessa dados de tenant B', () => {
  it('o service nunca usa prisma.platform() para leitura de dados e-SIC', () => {
    /**
     * O isolamento real é garantido pelo PostgreSQL RLS (policy "tenant_isolation"
     * em `manifestacoes`). O PrismaService seta `app.current_tenant_id` via GUC.
     *
     * Aqui verificamos que EsicService NUNCA usa prisma.platform() — o que seria
     * cross-tenant — apenas prisma.db.* (tenant-scoped).
     */
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'esic.service.ts'),
      'utf-8',
    );

    // Deve usar somente this.prisma.db.*
    expect(source).toContain('this.prisma.db');

    // Não deve usar platform() (seria cross-tenant — violação RLS)
    expect(source).not.toContain('this.prisma.platform()');
  });

  it('porStatus deve incluir contagem real por status (sem data de outras queries)', async () => {
    const prisma = buildPrismaWithQueryRaw();
    const service = new EsicService(prisma as any);

    const result = await service.estatisticas();

    expect(result.porStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'respondida', total: 5 }),
        expect.objectContaining({ status: 'em_analise', total: 3 }),
      ]),
    );
  });
});
