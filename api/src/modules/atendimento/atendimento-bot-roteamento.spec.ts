/**
 * Testes unitários: roteamento automático de escalada para secretaria.
 *
 * Cobre:
 *  1. resolverSecretariaId — match exato, com acento/caixa, parcial, nome inválido
 *  2. escalar com secretariaId → grava secretariaId + notifica secretaria (não ouvidores)
 *  3. escalar sem secretariaId → mantém comportamento genérico (notifica ouvidores)
 *  4. nome inválido → escala genérico (sem secretariaId, notifica ouvidores)
 *  5. tool chamar_ouvidor → passa secretariaNome para ctx.escalar
 */

import { AtendimentoBotService } from './atendimento-bot.service';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { IaService } from '../ia/ia.service';
import { ManifestacoesService } from '../manifestacoes/manifestacoes.service';
import { TramitacaoService } from '../manifestacoes/tramitacao.service';
import { ExpedienteService } from './expediente.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { executarFerramentaOuvidoria, ouvidoriaAddendumComSecretarias } from './atendimento-bot-tools';
import { UnprocessableEntityException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const SECRETARIAS = [
  { id: 'sec-saude-001', nome: 'Secretaria de Saúde' },
  { id: 'sec-assis-002', nome: 'Assistência Social' },
  { id: 'sec-obras-003', nome: 'Secretaria de Obras' },
  { id: 'sec-educ-004', nome: 'Secretaria de Educação' },
];

// ---------------------------------------------------------------------------
// 1. ouvidoriaAddendumComSecretarias — injeção da lista no addendum
// ---------------------------------------------------------------------------

describe('ouvidoriaAddendumComSecretarias()', () => {
  it('sem secretarias retorna o addendum base (sem linha de lista)', () => {
    const texto = ouvidoriaAddendumComSecretarias([]);
    expect(texto).not.toContain('SECRETARIAS DISPONÍVEIS PARA ENCAMINHAMENTO');
  });

  it('com secretarias injeta os nomes na lista', () => {
    const texto = ouvidoriaAddendumComSecretarias(SECRETARIAS);
    expect(texto).toContain('SECRETARIAS DISPONÍVEIS PARA ENCAMINHAMENTO');
    expect(texto).toContain('Secretaria de Saúde');
    expect(texto).toContain('Assistência Social');
    expect(texto).toContain('Secretaria de Obras');
  });

  it('inclui instrução de uso do parâmetro `secretaria`', () => {
    const texto = ouvidoriaAddendumComSecretarias(SECRETARIAS);
    expect(texto).toContain('parâmetro `secretaria` da tool `chamar_ouvidor`');
  });
});

// ---------------------------------------------------------------------------
// 2. executarFerramentaOuvidoria — case 'chamar_ouvidor'
//    Verifica que o nome da secretaria é repassado para ctx.escalar
// ---------------------------------------------------------------------------

describe('executarFerramentaOuvidoria — chamar_ouvidor', () => {
  it('repassa secretariaNome para ctx.escalar quando fornecido', async () => {
    const escalarMock = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      manifestacoes: {} as ManifestacoesService,
      tramitacao: {} as TramitacaoService,
      escalar: escalarMock,
      vincular: jest.fn(),
    };

    await executarFerramentaOuvidoria(ctx, 'chamar_ouvidor', {
      motivo: 'Cidadão quer falar com atendente de saúde',
      secretaria: 'Secretaria de Saúde',
    });

    expect(escalarMock).toHaveBeenCalledWith('Secretaria de Saúde');
  });

  it('chama ctx.escalar com undefined quando secretaria não é informada', async () => {
    const escalarMock = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      manifestacoes: {} as ManifestacoesService,
      tramitacao: {} as TramitacaoService,
      escalar: escalarMock,
      vincular: jest.fn(),
    };

    await executarFerramentaOuvidoria(ctx, 'chamar_ouvidor', {
      motivo: 'Cidadão quer atendente',
    });

    expect(escalarMock).toHaveBeenCalledWith(undefined);
  });

  it('chama ctx.escalar com undefined quando secretaria é string vazia', async () => {
    const escalarMock = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      manifestacoes: {} as ManifestacoesService,
      tramitacao: {} as TramitacaoService,
      escalar: escalarMock,
      vincular: jest.fn(),
    };

    await executarFerramentaOuvidoria(ctx, 'chamar_ouvidor', {
      motivo: 'Transferência geral',
      secretaria: '   ',
    });

    expect(escalarMock).toHaveBeenCalledWith(undefined);
  });

  it('retorna ok:true com instrução', async () => {
    const ctx = {
      manifestacoes: {} as ManifestacoesService,
      tramitacao: {} as TramitacaoService,
      escalar: jest.fn().mockResolvedValue(undefined),
      vincular: jest.fn(),
    };

    const resultado = await executarFerramentaOuvidoria(ctx, 'chamar_ouvidor', {
      motivo: 'teste',
    });

    expect((resultado as any).ok).toBe(true);
    expect((resultado as any).instrucao).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. AtendimentoConversaService.escalar — com secretariaId
// ---------------------------------------------------------------------------

describe('AtendimentoConversaService.escalar — roteamento por secretaria', () => {
  let service: AtendimentoConversaService;
  let prismaMock: any;
  let notifMock: any;

  beforeEach(() => {
    prismaMock = {
      db: {
        atendimentoConversa: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        atendimentoMensagem: {
          create: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
        },
        atendimentoEvento: { create: jest.fn().mockResolvedValue({}) },
        secretaria: {
          findUnique: jest.fn(),
        },
        tenant: {
          findFirst: jest.fn().mockResolvedValue({
            atendimentoSaudacao: null,
            atendimentoAvisoLgpd: null,
            atendimentoHumanoAtivo: true,
          }),
        },
      },
      platform: jest.fn().mockReturnValue({ tenant: { findUnique: jest.fn() } }),
    };

    notifMock = {
      avisarOuvidoresAtendimento: jest.fn().mockResolvedValue(undefined),
      avisarAtendentesSecretaria: jest.fn().mockResolvedValue(undefined),
    };

    service = new AtendimentoConversaService(prismaMock as any, notifMock as any);
  });

  it('grava secretariaId no update e notifica secretaria (não ouvidores)', async () => {
    prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'bot',
      canal: 'widget',
      assunto: 'Problema de saúde',
      secretariaId: null,
    });
    prismaMock.db.atendimentoConversa.update.mockResolvedValue({
      id: 'c1',
      status: 'aguardando_agente',
      canal: 'widget',
      assunto: 'Problema de saúde',
      secretariaId: 'sec-saude-001',
    });
    // Secretaria válida confirmada pelo findUnique
    prismaMock.db.secretaria.findUnique.mockResolvedValue({ id: 'sec-saude-001' });

    await service.escalar('c1', 'tenant1', true, 'sec-saude-001');

    // Deve atualizar com secretariaId
    expect(prismaMock.db.atendimentoConversa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secretariaId: 'sec-saude-001' }),
      }),
    );

    // Aguarda que fire-and-forget dispare (microtask)
    await Promise.resolve();
    await Promise.resolve();

    // Notifica secretaria, NÃO ouvidores
    expect(notifMock.avisarAtendentesSecretaria).toHaveBeenCalledWith(
      'tenant1',
      'sec-saude-001',
      expect.objectContaining({ conversaId: 'c1' }),
    );
    expect(notifMock.avisarOuvidoresAtendimento).not.toHaveBeenCalled();
  });

  it('secretariaId ausente → notifica ouvidores (comportamento genérico)', async () => {
    prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'c2',
      status: 'bot',
      canal: 'widget',
      assunto: 'Dúvida geral',
      secretariaId: null,
    });
    prismaMock.db.atendimentoConversa.update.mockResolvedValue({
      id: 'c2',
      status: 'aguardando_agente',
      canal: 'widget',
      assunto: 'Dúvida geral',
      secretariaId: null,
    });

    await service.escalar('c2', 'tenant1', true);

    // Aguarda que fire-and-forget dispare
    await Promise.resolve();
    await Promise.resolve();

    expect(notifMock.avisarOuvidoresAtendimento).toHaveBeenCalledWith(
      'tenant1',
      expect.objectContaining({ conversaId: 'c2' }),
    );
    expect(notifMock.avisarAtendentesSecretaria).not.toHaveBeenCalled();
  });

  it('secretariaId inválida (não encontrada no DB) → escala genérico sem secretariaId', async () => {
    prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'c3',
      status: 'bot',
      canal: 'widget',
      assunto: 'Qualquer',
      secretariaId: null,
    });
    prismaMock.db.atendimentoConversa.update.mockResolvedValue({
      id: 'c3',
      status: 'aguardando_agente',
      canal: 'widget',
      assunto: 'Qualquer',
      secretariaId: null,
    });
    // findUnique retorna null → id inexistente
    prismaMock.db.secretaria.findUnique.mockResolvedValue(null);

    await service.escalar('c3', 'tenant1', true, 'id-que-nao-existe');

    // O update NÃO deve ter secretariaId
    expect(prismaMock.db.atendimentoConversa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ secretariaId: expect.anything() }),
      }),
    );

    await Promise.resolve();
    await Promise.resolve();

    // Cai no fluxo genérico
    expect(notifMock.avisarOuvidoresAtendimento).toHaveBeenCalled();
    expect(notifMock.avisarAtendentesSecretaria).not.toHaveBeenCalled();
  });

  it('grava evento escalada com secretariaId quando há roteamento', async () => {
    prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'c4',
      status: 'bot',
      canal: 'widget',
      assunto: 'Obras na rua',
      secretariaId: null,
    });
    prismaMock.db.atendimentoConversa.update.mockResolvedValue({
      id: 'c4',
      status: 'aguardando_agente',
      canal: 'widget',
      assunto: 'Obras na rua',
      secretariaId: 'sec-obras-003',
    });
    prismaMock.db.secretaria.findUnique.mockResolvedValue({ id: 'sec-obras-003' });

    await service.escalar('c4', 'tenant1', true, 'sec-obras-003');

    expect(prismaMock.db.atendimentoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'escalada',
          payload: expect.objectContaining({ secretariaId: 'sec-obras-003' }),
        }),
      }),
    );
  });

  it('grava evento escalada SEM secretariaId quando fluxo genérico', async () => {
    prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'c5',
      status: 'bot',
      canal: 'widget',
      assunto: 'Geral',
      secretariaId: null,
    });
    prismaMock.db.atendimentoConversa.update.mockResolvedValue({
      id: 'c5',
      status: 'aguardando_agente',
      canal: 'widget',
      assunto: 'Geral',
      secretariaId: null,
    });

    await service.escalar('c5', 'tenant1', true);

    expect(prismaMock.db.atendimentoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'escalada',
          payload: {},
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. AtendimentoBotService — resolverSecretariaId (via escalarComExpediente)
//    Testado indiretamente: o bot chama escalarComExpediente(nome) que resolve
//    o id antes de chamar conversa.escalar.
// ---------------------------------------------------------------------------

describe('AtendimentoBotService — resolução nome→id via roteamento', () => {
  let service: AtendimentoBotService;
  let mockPrisma: any;
  let mockConversa: any;

  beforeEach(() => {
    mockPrisma = {
      db: {
        atendimentoConversa: {
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        atendimentoMensagem: {
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({}),
        },
        tenant: {
          findFirst: jest.fn().mockResolvedValue({
            iaChatWidgetAtivo: true,
            iaChatHabilitada: true,
            atendimentoHumanoAtivo: true,
          }),
        },
        secretaria: {
          findMany: jest.fn().mockResolvedValue(SECRETARIAS),
        },
      },
      platform: jest.fn().mockReturnValue({}),
    };

    mockConversa = {
      persistirMensagem: jest.fn().mockResolvedValue({}),
      escalar: jest.fn().mockResolvedValue({}),
      incrementarBotTentativas: jest.fn().mockResolvedValue(1),
    };

    service = new AtendimentoBotService(
      mockPrisma as unknown as PrismaService,
      { chatMultiturno: jest.fn().mockResolvedValue({ resposta: 'ok', confianca: 0.9 }) } as unknown as IaService,
      {} as unknown as ManifestacoesService,
      { acompanhar: jest.fn() } as unknown as TramitacaoService,
      { dentroDoExpediente: jest.fn().mockResolvedValue(true) } as unknown as ExpedienteService,
      mockConversa as unknown as AtendimentoConversaService,
      {} as unknown as WhatsappService,
    );
  });

  /**
   * Helper para invocar o método privado `resolverSecretariaId` via
   * duck-typed cast (é um método de instância privado — acesso via any).
   */
  async function resolverNome(nome: string): Promise<string | undefined> {
    return (service as any).resolverSecretariaId(TENANT_ID, nome);
  }

  it('match exato normalizado (sem acento)', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('Secretaria de Saude'); // sem acento
      expect(id).toBe('sec-saude-001');
    });
  });

  it('match exato com acento', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('Secretaria de Saúde');
      expect(id).toBe('sec-saude-001');
    });
  });

  it('match case-insensitive', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('secretaria de saúde');
      expect(id).toBe('sec-saude-001');
    });
  });

  it('match parcial — alvo contém nome da secretaria', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      // "Assistência Social" está contida em "CRAS Assistência Social"
      const id = await resolverNome('CRAS Assistência Social');
      expect(id).toBe('sec-assis-002');
    });
  });

  it('match parcial — nome da secretaria contém o alvo', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      // "Obras" está contida em "Secretaria de Obras"
      const id = await resolverNome('Obras');
      expect(id).toBe('sec-obras-003');
    });
  });

  it('nome inválido retorna undefined (escala genérico)', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('Secretaria do Futuro');
      expect(id).toBeUndefined();
    });
  });

  it('nome vazio retorna undefined', async () => {
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('');
      expect(id).toBeUndefined();
    });
  });

  it('falha no prisma retorna undefined (best-effort, nunca lança)', async () => {
    mockPrisma.db.secretaria.findMany.mockRejectedValueOnce(new Error('DB indisponível'));
    await TenantContext.run({ tenantId: TENANT_ID }, async () => {
      const id = await resolverNome('Secretaria de Saúde');
      expect(id).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Integração: processarMensagem com intent falar_com_atendente
  // passa undefined (sem secretaria) para conversa.escalar
  // ---------------------------------------------------------------------------

  it('intent falar_com_atendente escala sem secretaria (genérico)', async () => {
    mockPrisma.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'conv-gen',
      status: 'bot',
      canal: 'widget',
      visitanteTelefone: null,
      visitanteIdentificador: null,
      visitanteNome: null,
      assunto: null,
      botTentativas: 0,
      canalId: null,
    });
    mockPrisma.db.atendimentoMensagem.findUnique.mockResolvedValue({
      id: 'msg-001',
      conteudo: 'quero falar com atendente',
      autorTipo: 'visitante',
      interno: false,
    });

    await TenantContext.run({ tenantId: TENANT_ID }, () =>
      service.processarMensagem('conv-gen', 'msg-001', TENANT_ID),
    );

    // escalar chamado com dentro=true e secretariaId=undefined
    expect(mockConversa.escalar).toHaveBeenCalledWith(
      'conv-gen',
      TENANT_ID,
      true,   // dentroExpediente
      undefined, // secretariaId
    );
  });

  // ---------------------------------------------------------------------------
  // classificarSecretariaPorTexto — via processarMensagem com falar_com_atendente
  // ---------------------------------------------------------------------------

  it('intent falar_com_atendente com texto "buraco na rua" roteia para Obras', async () => {
    mockPrisma.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'conv-obras',
      status: 'bot',
      canal: 'widget',
      visitanteTelefone: null,
      visitanteIdentificador: null,
      visitanteNome: null,
      assunto: null,
      botTentativas: 0,
      canalId: null,
    });
    mockPrisma.db.atendimentoMensagem.findUnique.mockResolvedValue({
      id: 'msg-obras',
      conteudo: 'quero falar com atendente sobre o buraco na rua',
      autorTipo: 'visitante',
      interno: false,
    });

    await TenantContext.run({ tenantId: TENANT_ID }, () =>
      service.processarMensagem('conv-obras', 'msg-obras', TENANT_ID),
    );

    // Deve escalar para algum secretariaId (resolverSecretariaId converte nome→id)
    // ou o nome da secretaria de obras ser passado para escalarComExpediente.
    // Aqui verificamos que conversa.escalar foi chamado com secretariaId correspondente a obras.
    expect(mockConversa.escalar).toHaveBeenCalledWith(
      'conv-obras',
      TENANT_ID,
      true,
      'sec-obras-003',
    );
  });

  it('intent falar_com_atendente com texto "cras auxilio" roteia para Assistência Social', async () => {
    mockPrisma.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'conv-cras',
      status: 'bot',
      canal: 'widget',
      visitanteTelefone: null,
      visitanteIdentificador: null,
      visitanteNome: null,
      assunto: null,
      botTentativas: 0,
      canalId: null,
    });
    mockPrisma.db.atendimentoMensagem.findUnique.mockResolvedValue({
      id: 'msg-cras',
      conteudo: 'quero falar com atendente, preciso do cras',
      autorTipo: 'visitante',
      interno: false,
    });

    await TenantContext.run({ tenantId: TENANT_ID }, () =>
      service.processarMensagem('conv-cras', 'msg-cras', TENANT_ID),
    );

    expect(mockConversa.escalar).toHaveBeenCalledWith(
      'conv-cras',
      TENANT_ID,
      true,
      'sec-assis-002',
    );
  });

  it('intent falar_com_atendente sem keyword de secretaria → genérico (undefined)', async () => {
    mockPrisma.db.atendimentoConversa.findUnique.mockResolvedValue({
      id: 'conv-geral2',
      status: 'bot',
      canal: 'widget',
      visitanteTelefone: null,
      visitanteIdentificador: null,
      visitanteNome: null,
      assunto: null,
      botTentativas: 0,
      canalId: null,
    });
    mockPrisma.db.atendimentoMensagem.findUnique.mockResolvedValue({
      id: 'msg-geral2',
      conteudo: 'falar com atendente',
      autorTipo: 'visitante',
      interno: false,
    });

    await TenantContext.run({ tenantId: TENANT_ID }, () =>
      service.processarMensagem('conv-geral2', 'msg-geral2', TENANT_ID),
    );

    expect(mockConversa.escalar).toHaveBeenCalledWith(
      'conv-geral2',
      TENANT_ID,
      true,
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. classificarSecretariaPorTexto — unitário direto
// ---------------------------------------------------------------------------

describe('AtendimentoBotService — classificarSecretariaPorTexto', () => {
  let service: AtendimentoBotService;
  let mockPrisma: any;

  const SECRETARIAS_LOCAL = [
    { id: 'sec-saude-001', nome: 'Secretaria de Saúde' },
    { id: 'sec-assis-002', nome: 'Assistência Social' },
    { id: 'sec-obras-003', nome: 'Secretaria de Obras' },
    { id: 'sec-educ-004', nome: 'Secretaria de Educação' },
    { id: 'sec-fazenda-005', nome: 'Secretaria de Fazenda' },
    { id: 'sec-amb-006', nome: 'Secretaria de Meio Ambiente' },
  ];

  beforeEach(() => {
    mockPrisma = {
      db: {
        secretaria: {
          findMany: jest.fn().mockResolvedValue(SECRETARIAS_LOCAL),
        },
      },
      platform: jest.fn().mockReturnValue({}),
    };

    service = new AtendimentoBotService(
      mockPrisma as unknown as PrismaService,
      { chatMultiturno: jest.fn() } as unknown as IaService,
      {} as unknown as ManifestacoesService,
      { acompanhar: jest.fn() } as unknown as TramitacaoService,
      { dentroDoExpediente: jest.fn().mockResolvedValue(true) } as unknown as ExpedienteService,
      { persistirMensagem: jest.fn(), escalar: jest.fn(), incrementarBotTentativas: jest.fn() } as unknown as AtendimentoConversaService,
      {} as unknown as WhatsappService,
    );
  });

  async function classificar(texto: string, assunto?: string): Promise<string | undefined> {
    return TenantContext.run({ tenantId: TENANT_ID }, () =>
      (service as any).classificarSecretariaPorTexto(TENANT_ID, texto, assunto),
    );
  }

  it('retorna nome direto da secretaria quando token aparece no texto', async () => {
    const result = await classificar('preciso falar sobre saúde');
    expect(result).toBe('Secretaria de Saúde');
  });

  it('alias "buraco" → Secretaria de Obras', async () => {
    const result = await classificar('tem um buraco enorme na rua principal');
    expect(result).toBe('Secretaria de Obras');
  });

  it('alias "cras" → Assistência Social', async () => {
    const result = await classificar('preciso do cras urgente');
    expect(result).toBe('Assistência Social');
  });

  it('alias "escola" → Secretaria de Educação', async () => {
    const result = await classificar('quero fazer matricula na escola');
    expect(result).toBe('Secretaria de Educação');
  });

  it('alias "iptu" → Secretaria de Fazenda', async () => {
    const result = await classificar('certidao negativa de debitos iptu');
    expect(result).toBe('Secretaria de Fazenda');
  });

  it('alias "arvore" → Secretaria de Meio Ambiente', async () => {
    const result = await classificar('poda de arvore na frente da minha casa');
    expect(result).toBe('Secretaria de Meio Ambiente');
  });

  it('usa o assunto da conversa quando texto não contém keywords', async () => {
    const result = await classificar('quero falar com atendente', 'Sobre obras na minha rua');
    expect(result).toBe('Secretaria de Obras');
  });

  it('retorna undefined quando não há match (escala genérico)', async () => {
    const result = await classificar('quero falar com atendente');
    expect(result).toBeUndefined();
  });

  it('retorna undefined quando não há secretarias no tenant', async () => {
    mockPrisma.db.secretaria.findMany.mockResolvedValue([]);
    const result = await classificar('buraco na rua');
    expect(result).toBeUndefined();
  });

  it('retorna undefined quando prisma falha (best-effort)', async () => {
    mockPrisma.db.secretaria.findMany.mockRejectedValueOnce(new Error('DB offline'));
    const result = await classificar('problema de saúde');
    expect(result).toBeUndefined();
  });
});
