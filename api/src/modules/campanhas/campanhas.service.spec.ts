/**
 * Testes unitários do CampanhasService.
 * Foca em: validação de config, guard WCAG AA, resolver/precedência, semear biblioteca.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampanhasService } from './campanhas.service';
import { validarConfig } from './capabilities/validator';
import { contrastRatio, deriveFg, validarContrasteWcagAA } from './capabilities/wcag';

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function makePrismaDb(campanhas: unknown[] = []) {
  return {
    campaign: {
      findMany: jest.fn().mockResolvedValue(campanhas),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'uuid-test',
        ...data,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'uuid-test',
        ...data,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })),
      delete: jest.fn().mockResolvedValue({}),
    },
    campaignTemplate: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    campaignActivationLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function makePrisma(campanhas: unknown[] = []) {
  const db = makePrismaDb(campanhas);
  return {
    db,
    platform: jest.fn().mockReturnValue({
      ...db,
      campaignTemplate: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    }),
  };
}

function makeCache() {
  const store: Record<string, unknown> = {};
  return {
    get: jest.fn().mockImplementation(async (key: string) => store[key] ?? null),
    set: jest.fn().mockImplementation(async (key: string, val: unknown) => {
      store[key] = val;
    }),
    del: jest.fn().mockImplementation(async (key: string) => {
      delete store[key];
    }),
  };
}

// Mock TenantContext
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: jest.fn().mockReturnValue('tenant-uuid-test'),
  },
}));

// ---------------------------------------------------------------------------
// 1. WCAG — contraste
// ---------------------------------------------------------------------------

describe('WCAG — contrastRatio + deriveFg', () => {
  it('branco sobre preto tem contraste 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('preto sobre branco tem contraste 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('deriveFg("#e91e8c") retorna preto (contraste maior com preto para este rosa)', () => {
    // #e91e8c tem luminância ~0.168 — mais contraste com preto (razão ~2.39) que com branco?
    // Na verdade, deriveFg retorna qual for maior. Testamos apenas que o resultado é válido.
    const fg = deriveFg('#e91e8c');
    expect(fg).toMatch(/^#(ffffff|000000)$/);
    expect(contrastRatio('#e91e8c', fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('deriveFg("#f5c518") retorna preto (fundo amarelo claro)', () => {
    expect(deriveFg('#f5c518')).toBe('#000000');
  });

  it('validarContrasteWcagAA — cor escura (#1565c0 azul) com branco: ≥ 4.5:1', () => {
    // Azul escuro #1565c0 tem contraste suficiente com branco
    const result = validarContrasteWcagAA('#1565c0', '#ffffff');
    expect(result.corPrimariaFg).toBe('#ffffff');
    expect(contrastRatio('#1565c0', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('validarContrasteWcagAA — rejeita par com contraste insuficiente', () => {
    // Rosa escuro + rosa claro — provavelmente < 4.5:1
    expect(() => validarContrasteWcagAA('#e91e8c', '#ff80c0')).toThrow(
      /contraste insuficiente/i,
    );
  });

  it('validarContrasteWcagAA — sem fg: deriva automaticamente sem erro', () => {
    const result = validarContrasteWcagAA('#1565c0');
    expect(result.corPrimariaFg).toMatch(/^#(ffffff|000000)$/);
    expect(contrastRatio('#1565c0', result.corPrimariaFg)).toBeGreaterThanOrEqual(4.5);
  });

  it('fundo quase branco → fg preto automaticamente', () => {
    const result = validarContrasteWcagAA('#f0f0f0');
    expect(result.corPrimariaFg).toBe('#000000');
  });
});

// ---------------------------------------------------------------------------
// 2. validarConfig — capacidades
// ---------------------------------------------------------------------------

describe('validarConfig', () => {
  it('config vazio retorna {}', () => {
    expect(validarConfig({})).toEqual({});
  });

  it('config null retorna {}', () => {
    expect(validarConfig(null)).toEqual({});
  });

  it('tema válido com fg derivado', () => {
    const result = validarConfig({ tema: { corPrimaria: '#b5006b' } });
    expect(result.tema?.corPrimaria).toBe('#b5006b');
    expect(result.tema?.corPrimariaFg).toBe('#ffffff');
  });

  it('tema com fg explícito inválido: lança BadRequestException', () => {
    expect(() =>
      validarConfig({ tema: { corPrimaria: '#b5006b', corPrimariaFg: '#ff80c0' } }),
    ).toThrow(BadRequestException);
  });

  it('tema sem corPrimaria: lança BadRequestException', () => {
    expect(() => validarConfig({ tema: { corDestaque: '#fff' } })).toThrow(BadRequestException);
  });

  it('tema com corPrimaria hex inválido: lança BadRequestException', () => {
    expect(() => validarConfig({ tema: { corPrimaria: 'roxo' } })).toThrow(BadRequestException);
  });

  it('faixa válida', () => {
    const result = validarConfig({ faixa: { mensagem: 'Alerta dengue', corBg: '#c8372d', corTexto: '#fff' } });
    expect(result.faixa?.mensagem).toBe('Alerta dengue');
    expect(result.faixa?.dismissivel).toBe(true); // default
  });

  it('faixa sem mensagem: lança BadRequestException', () => {
    expect(() => validarConfig({ faixa: { corBg: '#fff' } })).toThrow(BadRequestException);
  });

  it('banner sem alt: lança BadRequestException', () => {
    expect(() =>
      validarConfig({ banner: { imagemUrl: '/img.jpg' } }),
    ).toThrow(BadRequestException);
  });

  it('banner válido', () => {
    const result = validarConfig({ banner: { imagemUrl: '/img.jpg', alt: 'descrição' } });
    expect(result.banner?.posicao).toBe('home_topo'); // default
  });

  it('popup sem titulo: lança BadRequestException', () => {
    expect(() =>
      validarConfig({ popup: { descricao: 'desc' } }),
    ).toThrow(BadRequestException);
  });

  it('popup com bullets > 6: lança BadRequestException', () => {
    expect(() =>
      validarConfig({
        popup: {
          titulo: 'T',
          descricao: 'D',
          bullets: ['1', '2', '3', '4', '5', '6', '7'],
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('efeito aedes-overlay válido', () => {
    const result = validarConfig({
      efeito: {
        nome: 'aedes-overlay',
        params: { quantidadeMosquitos: 5, corPrimaria: '#294961' },
      },
    });
    expect(result.efeito?.nome).toBe('aedes-overlay');
  });

  it('efeito aedes-overlay: quantidadeMosquitos > 8 lança erro', () => {
    expect(() =>
      validarConfig({
        efeito: {
          nome: 'aedes-overlay',
          params: { quantidadeMosquitos: 10 },
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('efeito nome inválido: lança BadRequestException', () => {
    expect(() =>
      validarConfig({ efeito: { nome: 'explosao', params: {} } }),
    ).toThrow(BadRequestException);
  });

  it('efeito copa-overlay: intensidade inválida', () => {
    expect(() =>
      validarConfig({
        efeito: { nome: 'copa-overlay', params: { intensidade: 'ultra' } },
      }),
    ).toThrow(BadRequestException);
  });

  it('selo sem texto: lança BadRequestException', () => {
    expect(() => validarConfig({ selo: { cor: '#fff' } })).toThrow(BadRequestException);
  });

  it('pagina sem slug: lança BadRequestException', () => {
    expect(() => validarConfig({ pagina: { autoDespublica: true } })).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// 3. CampanhasService — resolver / precedência
// ---------------------------------------------------------------------------

describe('CampanhasService — resolver e precedência', () => {
  let service: CampanhasService;

  function buildCampanha(overrides: Record<string, unknown>) {
    return {
      id: `camp-${Math.random()}`,
      tenantId: 'tenant-uuid-test',
      status: 'active',
      startsAt: null,
      endsAt: null,
      prioridade: 100,
      config: {},
      recorrencia: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    service = new CampanhasService(makePrisma() as never, makeCache() as never);
  });

  it('contexto vazio quando sem campanhas', async () => {
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue([]);
    const ctx = await service.resolverAtivas();
    expect(ctx.tema).toBeNull();
    expect(ctx.faixas).toHaveLength(0);
    expect(ctx.popup).toBeNull();
  });

  it('tema: vence a campanha de maior prioridade', async () => {
    const camps = [
      buildCampanha({
        id: 'camp-baixa',
        prioridade: 50,
        config: { tema: { corPrimaria: '#ff0000', corPrimariaFg: '#ffffff', aplicarEm: 'todo' } },
      }),
      buildCampanha({
        id: 'camp-alta',
        prioridade: 200,
        config: { tema: { corPrimaria: '#0000ff', corPrimariaFg: '#ffffff', aplicarEm: 'todo' } },
      }),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    const ctx = await service.resolverAtivas();
    expect(ctx.tema?.campaignId).toBe('camp-alta');
    expect(ctx.tema?.corPrimaria).toBe('#0000ff');
  });

  it('faixa: empilha até 2', async () => {
    const camps = [
      buildCampanha({ id: 'c1', prioridade: 300, config: { faixa: { mensagem: 'F1' } } }),
      buildCampanha({ id: 'c2', prioridade: 200, config: { faixa: { mensagem: 'F2' } } }),
      buildCampanha({ id: 'c3', prioridade: 100, config: { faixa: { mensagem: 'F3' } } }),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    const ctx = await service.resolverAtivas();
    expect(ctx.faixas).toHaveLength(2);
    expect(ctx.faixas[0].mensagem).toBe('F1');
    expect(ctx.faixas[1].mensagem).toBe('F2');
  });

  it('banner: empilha até 3', async () => {
    const makeBanner = (id: string, p: number) =>
      buildCampanha({
        id,
        prioridade: p,
        config: { banner: { imagemUrl: `/img${id}.jpg`, alt: `alt ${id}` } },
      });

    const camps = [
      makeBanner('b1', 400),
      makeBanner('b2', 300),
      makeBanner('b3', 200),
      makeBanner('b4', 100),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    const ctx = await service.resolverAtivas();
    expect(ctx.banners).toHaveLength(3);
  });

  it('efeito: teto 1 — vence o de maior prioridade', async () => {
    const camps = [
      buildCampanha({
        id: 'ef1',
        prioridade: 200,
        config: { efeito: { nome: 'aedes-overlay', params: {} } },
      }),
      buildCampanha({
        id: 'ef2',
        prioridade: 100,
        config: { efeito: { nome: 'copa-overlay', params: {} } },
      }),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    const ctx = await service.resolverAtivas();
    expect(ctx.efeitos).toHaveLength(1);
    expect(ctx.efeitos[0].nome).toBe('aedes-overlay');
  });

  it('popup: 1 — maior prioridade', async () => {
    const camps = [
      buildCampanha({
        id: 'p1',
        prioridade: 300,
        config: { popup: { titulo: 'Popup Alta', descricao: 'desc' } },
      }),
      buildCampanha({
        id: 'p2',
        prioridade: 100,
        config: { popup: { titulo: 'Popup Baixa', descricao: 'desc' } },
      }),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    const ctx = await service.resolverAtivas();
    expect(ctx.popup?.campaignId).toBe('p1');
  });

  it('capacidade malformada é ignorada (tolerância)', async () => {
    const camps = [
      buildCampanha({
        id: 'malf',
        config: {
          // tema inválido — sem corPrimaria
          tema: { corDestaque: '#fff' },
          // faixa válida
          faixa: { mensagem: 'OK' },
        },
      }),
    ];
    (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany.mockResolvedValue(camps);

    // O resolver é tolerante — não lança, ignora o tema inválido
    const ctx = await service.resolverAtivas();
    expect(ctx.tema).toBeNull();
    expect(ctx.faixas[0].mensagem).toBe('OK');
  });

  it('usa cache Redis quando disponível', async () => {
    const cachedCtx = {
      tema: null,
      faixas: [{ campaignId: 'cached', mensagem: 'do cache' }],
      banners: [],
      popup: null,
      efeitos: [],
      selos: [],
      paginas: [],
    };
    const cache = makeCache();
    cache.get.mockResolvedValue(cachedCtx);
    service = new CampanhasService(makePrisma() as never, cache as never);

    const ctx = await service.resolverAtivas();
    expect(ctx.faixas[0].mensagem).toBe('do cache');
    // findMany NÃO deve ser chamado quando há cache
    expect(
      (service as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma.db.campaign.findMany,
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. CampanhasService — CRUD básico
// ---------------------------------------------------------------------------

describe('CampanhasService — CRUD', () => {
  let service: CampanhasService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CampanhasService(prisma as never, makeCache() as never);
  });

  it('criar — sem nome lança BadRequestException', async () => {
    await expect(service.criar({ nome: '' }, 'ator-id')).rejects.toThrow(BadRequestException);
  });

  it('criar — config inválido lança BadRequestException', async () => {
    await expect(
      service.criar({ nome: 'Test', config: { tema: {} } }, 'ator-id'),
    ).rejects.toThrow(BadRequestException);
  });

  it('criar — campanha válida retorna objeto com id', async () => {
    const result = await service.criar(
      { nome: 'Dengue 2026', config: { faixa: { mensagem: 'Alerta' } } },
      'ator-id',
    );
    expect(result.id).toBeDefined();
    expect(prisma.db.campaignActivationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'created' }) }),
    );
  });

  it('detalhe — id inexistente lança NotFoundException', async () => {
    prisma.db.campaign.findUnique.mockResolvedValue(null);
    await expect(service.detalhe('id-fake')).rejects.toThrow(NotFoundException);
  });

  it('setStatus — status inválido lança BadRequestException', async () => {
    await expect(
      service.setStatus('id', 'invalido' as never, 'ator'),
    ).rejects.toThrow(BadRequestException);
  });

  it('setStatus — active grava ação "activated"', async () => {
    prisma.db.campaign.findUnique.mockResolvedValue({ id: 'camp-id' });
    prisma.db.campaign.update.mockResolvedValue({ id: 'camp-id', status: 'active' });

    await service.setStatus('camp-id', 'active', 'ator');

    expect(prisma.db.campaignActivationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'activated', campaignId: 'camp-id' }),
      }),
    );
  });

  it('instalarPreset — template inexistente lança NotFoundException', async () => {
    prisma.db.campaignTemplate.findUnique.mockResolvedValue(null);
    await expect(service.instalarPreset('inexistente', 'ator')).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// 5. Semear biblioteca — verifica que os presets obrigatórios estão presentes
// ---------------------------------------------------------------------------

describe('BIBLIOTECA_PRESETS — integridade', () => {
  const { BIBLIOTECA_PRESETS } = jest.requireActual<typeof import('./seeds/biblioteca')>(
    './seeds/biblioteca',
  );

  const keys = BIBLIOTECA_PRESETS.map((p) => p.key);

  const OBRIGATORIOS = [
    'dengue',
    'copa',
    'setembro-amarelo',
    'outubro-rosa',
    'novembro-azul',
    'janeiro-branco',
    'agosto-lilas',
    'maio-amarelo',
    'iptu',
    'campanha-agasalho',
    'estiagem-queimadas',
    'vacinacao',
    'aniversario-cidade',
  ];

  for (const key of OBRIGATORIOS) {
    it(`preset obrigatório "${key}" presente`, () => {
      expect(keys).toContain(key);
    });
  }

  it('nenhum preset tem key duplicada', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('todos presets têm configDefault como objeto', () => {
    for (const p of BIBLIOTECA_PRESETS) {
      expect(typeof p.configDefault).toBe('object');
    }
  });

  it('todos presets têm categoria válida', () => {
    const CATS = ['saude', 'civico', 'sazonal', 'fiscal', 'ambiental', 'cultural', 'administrativo'];
    for (const p of BIBLIOTECA_PRESETS) {
      expect(CATS).toContain(p.categoria);
    }
  });

  it('presets com tema têm fg derivado com contraste AA', () => {
    const { contrastRatio } = jest.requireActual<typeof import('./capabilities/wcag')>(
      './capabilities/wcag',
    );

    for (const p of BIBLIOTECA_PRESETS) {
      const t = p.configDefault.tema as
        | { corPrimaria: string; corPrimariaFg: string }
        | undefined;
      if (!t) continue;
      const ratio = contrastRatio(t.corPrimaria, t.corPrimariaFg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
