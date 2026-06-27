/**
 * Testes unitários do AtendimentoWhatsappAgenteService.
 *
 * Cobre:
 *  - Identificação por número (match/no-match, matching robusto BR)
 *  - Identificação por chat_id do Telegram (match exato + não-verificado → false)
 *  - ATENDER com fila vazia / não-vazia
 *  - Mensagem comum roteada como agente (cidadão recebe)
 *  - ENCERRAR / SAIR limpam o vínculo Redis
 *  - Número de não-agente retorna false
 *  - FILA lista conversas
 *  - AJUDA retorna menu
 *  - tentarRotearComoAgente('telegram') roteia comando
 */

import { AtendimentoWhatsappAgenteService } from './atendimento-whatsapp-agente.service';

// ------------------------------------------------------------------ mocks

const mockPrismaDb = {
  userContato: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  atendimentoConversa: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

const mockPrisma = {
  db: mockPrismaDb,
  platform: jest.fn().mockReturnValue({ tenant: { findUnique: jest.fn() } }),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockConversaService = {
  assumir: jest.fn(),
  encerrar: jest.fn(),
  persistirMensagem: jest.fn(),
};

const mockWhatsapp = {
  enviar: jest.fn().mockResolvedValue({ id: 'msg1' }),
  enviarPorCanal: jest.fn().mockResolvedValue({ id: 'msg1' }),
};

// ------------------------------------------------------------------ factory

function criarService(): AtendimentoWhatsappAgenteService {
  return new AtendimentoWhatsappAgenteService(
    mockPrisma as any,
    mockRedis as any,
    mockConversaService as any,
    mockWhatsapp as any,
  );
}

// ------------------------------------------------------------------ helpers de fixture

function setupAgenteVerificado(
  numero: string = '5566999998888',
  role: string = 'ouvidor',
) {
  mockPrismaDb.userContato.findMany.mockResolvedValue([
    { userId: 'user-1', whatsapp: numero },
  ]);
  mockPrismaDb.user.findUnique.mockResolvedValue({
    id: 'user-1',
    nome: 'Maria Ouvidora',
    role,
  });
}

function setupSemAgente() {
  mockPrismaDb.userContato.findMany.mockResolvedValue([]);
}

// ------------------------------------------------------------------ TenantContext stub
// O TenantContext.run apenas executa o callback na mesma chamada (sem AsyncLocalStorage real)
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    run: (_opts: unknown, fn: () => unknown) => fn(),
    tenantId: () => 'tenant-1',
  },
}));

// ------------------------------------------------------------------ testes

describe('AtendimentoWhatsappAgenteService', () => {
  let svc: AtendimentoWhatsappAgenteService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = criarService();
  });

  // ---- 1. tentarRotearComoAgente retorna false para número desconhecido

  it('retorna false quando número não corresponde a nenhum agente verificado', async () => {
    setupSemAgente();
    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999990000', 'oi', null);
    expect(resultado).toBe(false);
  });

  it('retorna false quando usuário encontrado não tem role de atendimento', async () => {
    mockPrismaDb.userContato.findMany.mockResolvedValue([
      { userId: 'user-2', whatsapp: '5566999998888' },
    ]);
    mockPrismaDb.user.findUnique.mockResolvedValue({
      id: 'user-2',
      nome: 'João Servidor',
      role: 'servidor', // role NÃO permitida
    });
    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'oi', null);
    expect(resultado).toBe(false);
  });

  // ---- 2. Matching robusto de telefone BR

  it('retorna true (agente identificado) mesmo com formatos diferentes de número', async () => {
    // Agente cadastrado com formatação, remetente sem
    mockPrismaDb.userContato.findMany.mockResolvedValue([
      { userId: 'user-1', whatsapp: '66 9 9999-8888' }, // formatado
    ]);
    mockPrismaDb.user.findUnique.mockResolvedValue({ id: 'user-1', nome: 'Ouvidor', role: 'ouvidor' });
    mockRedis.get.mockResolvedValue(null); // sem vínculo
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null);
    mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
    mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'FILA', null);
    expect(resultado).toBe(true);
  });

  it('retorna true para agente com role assistente_ouvidoria', async () => {
    setupAgenteVerificado('5566999997777', 'assistente_ouvidoria');
    mockRedis.get.mockResolvedValue(null);
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null);
    mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
    mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999997777', 'FILA', null);
    expect(resultado).toBe(true);
  });

  it('retorna true para agente com role admin_prefeitura', async () => {
    setupAgenteVerificado('5566999996666', 'admin_prefeitura');
    mockRedis.get.mockResolvedValue(null);
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null);
    mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
    mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999996666', 'FILA', null);
    expect(resultado).toBe(true);
  });

  // ---- 3. ATENDER com fila vazia

  it('ATENDER com fila vazia → responde ao ouvidor e não chama assumir', async () => {
    setupAgenteVerificado();
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null); // fila vazia

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'ATENDER', null);

    expect(mockConversaService.assumir).not.toHaveBeenCalled();
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('fila agora'),
    );
  });

  // ---- 4. ATENDER com fila não-vazia

  it('ATENDER com conversa na fila → chama assumir, grava Redis, confirma ao ouvidor', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440000';
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue({
      id: conversaId,
      assunto: 'Problema com alvará',
    });
    mockConversaService.assumir.mockResolvedValue({ id: conversaId });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'proximo', null);

    expect(mockConversaService.assumir).toHaveBeenCalledWith(conversaId, 'tenant-1', 'user-1');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'atend:wpp-bind:tenant-1:user-1',
      conversaId,
      21600,
    );
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('assumiu'),
    );
  });

  // ---- 5. Mensagem comum roteada como agente ao cidadão

  it('mensagem comum com vínculo ativo envia ao cidadão via whatsapp e emite persistirMensagem', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440001';

    mockRedis.get.mockResolvedValue(conversaId); // vínculo existe
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'em_atendimento',
      agenteId: 'user-1',
      canal: 'whatsapp',
      visitanteTelefone: '5577888881234',
      visitanteIdentificador: '5577888881234',
      canalId: null,
    });
    mockConversaService.persistirMensagem.mockResolvedValue({ id: 'msg-99' });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'Olá cidadão, posso ajudar?', null);

    expect(mockConversaService.persistirMensagem).toHaveBeenCalledWith(
      conversaId,
      'tenant-1',
      expect.objectContaining({ autorTipo: 'agente', autorId: 'user-1' }),
    );
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith('5577888881234', 'Olá cidadão, posso ajudar?');
    // TTL renovado
    expect(mockRedis.set).toHaveBeenCalledWith(
      'atend:wpp-bind:tenant-1:user-1',
      conversaId,
      21600,
    );
  });

  it('mensagem comum roteada via canalId usa enviarPorCanal', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440002';

    mockRedis.get.mockResolvedValue(conversaId);
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'em_atendimento',
      agenteId: 'user-1',
      canal: 'whatsapp',
      visitanteTelefone: '5577888881234',
      visitanteIdentificador: '5577888881234',
      canalId: 'canal-meta-1',
    });
    mockConversaService.persistirMensagem.mockResolvedValue({ id: 'msg-100' });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'Tudo bem?', 'canal-meta-1');

    expect(mockWhatsapp.enviarPorCanal).toHaveBeenCalledWith('canal-meta-1', '5577888881234', 'Tudo bem?');
    expect(mockWhatsapp.enviar).not.toHaveBeenCalledWith('5577888881234', expect.any(String));
  });

  it('sem vínculo ativo responde orientando o agente', async () => {
    setupAgenteVerificado();
    mockRedis.get.mockResolvedValue(null); // sem vínculo

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'Olá', null);

    expect(mockConversaService.persistirMensagem).not.toHaveBeenCalled();
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('nao esta atendendo'),
    );
  });

  // ---- 6. ENCERRAR limpa vínculo

  it('ENCERRAR com vínculo ativo chama encerrar e limpa Redis', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440003';

    mockRedis.get.mockResolvedValue(conversaId);
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'em_atendimento',
      agenteId: 'user-1',
    });
    mockConversaService.encerrar.mockResolvedValue({ id: conversaId, status: 'encerrada' });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'ENCERRAR', null);

    expect(mockConversaService.encerrar).toHaveBeenCalledWith(
      conversaId,
      'tenant-1',
      'user-1',
      expect.any(String),
    );
    expect(mockRedis.del).toHaveBeenCalledWith('atend:wpp-bind:tenant-1:user-1');
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('encerrado'),
    );
  });

  it('ENCERRAR sem vínculo orienta o agente sem chamar encerrar', async () => {
    setupAgenteVerificado();
    mockRedis.get.mockResolvedValue(null);

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'FINALIZAR', null);

    expect(mockConversaService.encerrar).not.toHaveBeenCalled();
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('nao esta atendendo'),
    );
  });

  // ---- 7. SAIR limpa vínculo

  it('SAIR com vínculo ativo faz update para aguardando_agente e limpa Redis', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440004';

    mockRedis.get.mockResolvedValue(conversaId);
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'em_atendimento',
      agenteId: 'user-1',
    });
    mockPrismaDb.atendimentoConversa.update.mockResolvedValue({ id: conversaId, status: 'aguardando_agente' });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'SAIR', null);

    expect(mockPrismaDb.atendimentoConversa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversaId },
        data: expect.objectContaining({ status: 'aguardando_agente', agenteId: null }),
      }),
    );
    expect(mockRedis.del).toHaveBeenCalledWith('atend:wpp-bind:tenant-1:user-1');
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('devolvido'),
    );
  });

  it('LIBERAR sem vínculo orienta o agente', async () => {
    setupAgenteVerificado();
    mockRedis.get.mockResolvedValue(null);

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'LIBERAR', null);

    expect(mockPrismaDb.atendimentoConversa.update).not.toHaveBeenCalled();
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('nao esta atendendo'),
    );
  });

  // ---- 8. FILA lista conversas

  it('FILA com conversas aguardando lista resultados LGPD-safe', async () => {
    setupAgenteVerificado();
    const agora = new Date();
    mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440010', assunto: 'Alvará de obra', iniciadaEm: new Date(agora.getTime() - 5 * 60000) },
      { id: '550e8400-e29b-41d4-a716-446655440011', assunto: 'Conta de água', iniciadaEm: new Date(agora.getTime() - 12 * 60000) },
    ]);
    mockPrismaDb.atendimentoConversa.count.mockResolvedValue(2);

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'LISTA', null);

    const chamada = mockWhatsapp.enviar.mock.calls[0][1] as string;
    // Deve conter o código curto (6 chars do UUID sem hífen) e o assunto
    expect(chamada).toContain('Alvará de obra');
    expect(chamada).toContain('Conta de água');
    // NÃO deve conter nomes ou telefones
    expect(chamada).not.toContain('5577');
    expect(chamada).toContain('2 aguardando');
  });

  it('FILA vazia responde que está vazia', async () => {
    setupAgenteVerificado();
    mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
    mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'FILA', null);

    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('vazia'),
    );
  });

  // ---- 9. AJUDA

  it('AJUDA retorna menu de comandos', async () => {
    setupAgenteVerificado();

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', '?', null);

    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('ATENDER'),
    );
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('ENCERRAR'),
    );
  });

  // ---- 10. Vínculo inválido (conversa já encerrada) é limpo

  it('mensagem comum com vínculo mas conversa encerrada limpa Redis e orienta', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440005';

    mockRedis.get.mockResolvedValue(conversaId);
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'encerrada',
      agenteId: 'user-1',
      canal: 'whatsapp',
      visitanteTelefone: '5577888881234',
      canalId: null,
    });

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'ainda tem mais?', null);

    expect(mockConversaService.persistirMensagem).not.toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith('atend:wpp-bind:tenant-1:user-1');
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('expirado'),
    );
  });

  // ---- 11. ATENDER com "próximo" acentuado

  it('PRÓXIMO (acentuado) é reconhecido como comando ATENDER', async () => {
    setupAgenteVerificado();
    mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null);

    await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'PRÓXIMO', null);

    // Sem conversa na fila → responde que fila está vazia (significa que o comando foi reconhecido)
    expect(mockWhatsapp.enviar).toHaveBeenCalledWith(
      '5566999998888',
      expect.stringContaining('fila agora'),
    );
  });

  // ---- 12. Retorna true mesmo quando encaminhamento ao cidadão falha (best-effort)

  it('retorna true mesmo quando enviar ao cidadão lança erro (best-effort)', async () => {
    setupAgenteVerificado();
    const conversaId = '550e8400-e29b-41d4-a716-446655440006';

    mockRedis.get.mockResolvedValue(conversaId);
    mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
      id: conversaId,
      status: 'em_atendimento',
      agenteId: 'user-1',
      canal: 'whatsapp',
      visitanteTelefone: '5577000000001',
      visitanteIdentificador: '5577000000001',
      canalId: null,
    });
    mockConversaService.persistirMensagem.mockResolvedValue({ id: 'msg-200' });
    mockWhatsapp.enviar.mockRejectedValueOnce(new Error('Timeout')).mockResolvedValue({ id: 'ok' });

    const resultado = await svc.tentarRotearComoAgente('tenant-1', '5566999998888', 'ok', null);

    expect(resultado).toBe(true);
    // persistirMensagem foi chamado (a mensagem foi gravada mesmo que o envio falhe)
    expect(mockConversaService.persistirMensagem).toHaveBeenCalled();
  });

  // ================================================================
  // ---- 13. Telegram: identificarAgente por chat_id exato
  // ================================================================

  describe('Telegram — identificarAgente', () => {
    function setupAgenteTelegramVerificado(chatId: string, role: string = 'ouvidor') {
      mockPrismaDb.userContato.findMany.mockResolvedValue([
        { userId: 'user-tg-1', telegramChatId: chatId },
      ]);
      mockPrismaDb.user.findUnique.mockResolvedValue({
        id: 'user-tg-1',
        nome: 'Ouvidor Telegram',
        role,
      });
    }

    it('retorna true quando chat_id bate exatamente e agente é verificado', async () => {
      setupAgenteTelegramVerificado('123456789');
      mockRedis.get.mockResolvedValue(null);
      mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
      mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '123456789',
        'FILA',
        'canal-tg-1',
        'telegram',
      );
      expect(resultado).toBe(true);
      // A busca deve ter sido feita com telegramVerificado, não whatsappVerificado
      expect(mockPrismaDb.userContato.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ telegramVerificado: true }),
        }),
      );
    });

    it('retorna false quando chat_id NÃO bate (remetente diferente)', async () => {
      setupAgenteTelegramVerificado('123456789');

      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '999999999', // outro chat_id
        'FILA',
        'canal-tg-1',
        'telegram',
      );
      expect(resultado).toBe(false);
    });

    it('retorna false quando telegramVerificado = false (usuário não verificado)', async () => {
      // Simula lista vazia (findMany com where.telegramVerificado=true retorna [])
      mockPrismaDb.userContato.findMany.mockResolvedValue([]);

      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '123456789',
        'FILA',
        'canal-tg-1',
        'telegram',
      );
      expect(resultado).toBe(false);
    });

    it('retorna false quando role não é de atendimento', async () => {
      mockPrismaDb.userContato.findMany.mockResolvedValue([
        { userId: 'user-tg-2', telegramChatId: '555000111' },
      ]);
      mockPrismaDb.user.findUnique.mockResolvedValue({
        id: 'user-tg-2',
        nome: 'Servidor Comum',
        role: 'servidor', // role NÃO permitida
      });

      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '555000111',
        'FILA',
        'canal-tg-1',
        'telegram',
      );
      expect(resultado).toBe(false);
    });

    it('tentarRotearComoAgente telegram roteia comando ATENDER', async () => {
      setupAgenteTelegramVerificado('987654321', 'ouvidor');
      mockPrismaDb.atendimentoConversa.findFirst.mockResolvedValue(null); // fila vazia

      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '987654321',
        'ATENDER',
        'canal-tg-1',
        'telegram',
      );

      expect(resultado).toBe(true);
      expect(mockConversaService.assumir).not.toHaveBeenCalled(); // fila vazia
      // Deve responder via enviarPorCanal (canalId presente)
      expect(mockWhatsapp.enviarPorCanal).toHaveBeenCalledWith(
        'canal-tg-1',
        '987654321',
        expect.stringContaining('fila agora'),
      );
    });

    it('tentarRotearComoAgente telegram envia resposta ao cidadão pelo canal de origem', async () => {
      setupAgenteTelegramVerificado('111222333', 'assistente_ouvidoria');
      const conversaId = '550e8400-e29b-41d4-a716-446655440099';

      mockRedis.get.mockResolvedValue(conversaId);
      mockPrismaDb.atendimentoConversa.findUnique.mockResolvedValue({
        id: conversaId,
        status: 'em_atendimento',
        agenteId: 'user-tg-1',
        canal: 'telegram', // cidadão veio pelo Telegram
        visitanteTelefone: null,
        visitanteIdentificador: '444555666', // chat_id do cidadão
        canalId: 'canal-tg-cidadao',
      });
      mockConversaService.persistirMensagem.mockResolvedValue({ id: 'msg-tg-1' });

      await svc.tentarRotearComoAgente(
        'tenant-1',
        '111222333',
        'Sua solicitação foi atendida.',
        'canal-tg-1',
        'telegram',
      );

      expect(mockConversaService.persistirMensagem).toHaveBeenCalledWith(
        conversaId,
        'tenant-1',
        expect.objectContaining({ autorTipo: 'agente', autorId: 'user-tg-1' }),
      );
      // Entrega ao cidadão no canal de origem (telegram canalId do cidadão)
      expect(mockWhatsapp.enviarPorCanal).toHaveBeenCalledWith(
        'canal-tg-cidadao',
        '444555666',
        'Sua solicitação foi atendida.',
      );
    });

    it('canalTipo padrão é whatsapp — callers sem o 5º argumento continuam funcionando', async () => {
      // Simula o comportamento dos webhooks WhatsApp existentes que não passam canalTipo
      setupAgenteVerificado('5566111112222', 'ouvidor');
      mockRedis.get.mockResolvedValue(null);
      mockPrismaDb.atendimentoConversa.findMany.mockResolvedValue([]);
      mockPrismaDb.atendimentoConversa.count.mockResolvedValue(0);

      // Chamada SEM o 5º parâmetro — deve usar default 'whatsapp'
      const resultado = await svc.tentarRotearComoAgente(
        'tenant-1',
        '5566111112222',
        'FILA',
        null,
        // canalTipo omitido — default 'whatsapp'
      );
      expect(resultado).toBe(true);
      // Deve ter buscado por whatsappVerificado (não telegramVerificado)
      expect(mockPrismaDb.userContato.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ whatsappVerificado: true }),
        }),
      );
    });
  });
});
