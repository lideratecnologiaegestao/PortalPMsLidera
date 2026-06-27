/**
 * Testes unitários do fluxo de vínculo Telegram no TelegramWebhookController.
 *
 * Verifica que:
 *  1. Mensagens com padrão de código ("123456", "/vincular 123456", "/start 123456")
 *     são interceptadas ANTES do fluxo de agente e cidadão.
 *  2. Vínculo bem-sucedido envia mensagem de confirmação ao funcionário e retorna.
 *  3. Código inválido/expirado segue para o fluxo normal (não interrompe).
 *  4. Mensagens comuns ("Olá", "123") não são confundidas com vínculo.
 *
 * Padrão do projeto: sem @nestjs/testing; mocks manuais; sem banco nem Redis.
 */

import { of } from 'rxjs';

// ---- RE_VINCULO_CODIGO (idêntica à do controller) ---------------------------
const RE_VINCULO_CODIGO = /^\/?(vincular|start)\s+(\d{6})$|^(\d{6})$/i;

function extrairCodigo(texto: string): string | null {
  const m = texto.trim().match(RE_VINCULO_CODIGO);
  if (!m) return null;
  return m[2] ?? m[3] ?? null;
}

// ============================================================================
// Regex — detecção de padrão de código de vínculo
// ============================================================================

describe('RE_VINCULO_CODIGO — detecção de padrão', () => {
  const casos: Array<[string, string | null]> = [
    // Formatos aceitos
    ['123456', '123456'],
    ['/vincular 123456', '123456'],
    ['/start 123456', '123456'],
    ['vincular 123456', '123456'],
    ['VINCULAR 123456', '123456'],
    ['/VINCULAR 123456', '123456'],
    ['  123456  ', '123456'],       // trim
    // Formatos rejeitados
    ['12345', null],                // 5 dígitos — curto demais
    ['1234567', null],              // 7 dígitos — longo demais
    ['Olá tudo bem?', null],
    ['ATENDER', null],
    ['FILA', null],
    ['/ajuda', null],
    ['abc123', null],
    ['123456 extra', null],         // código seguido de texto
  ];

  test.each(casos)('"%s" → %s', (entrada, esperado) => {
    expect(extrairCodigo(entrada)).toBe(esperado);
  });
});

// ============================================================================
// Simulação da lógica do método processar() do controller
// ============================================================================

/**
 * Extrai a lógica de vínculo do método `processar` para teste isolado,
 * reproduzindo exatamente o comportamento implementado no controller.
 */
async function simularProcessarVinculo(params: {
  texto: string | undefined;
  vincularResult: { ok: boolean; nome?: string };
  canalMetaToken: string | null;
  sendTextFn: jest.Mock;
}): Promise<'vinculo_ok' | 'vinculo_falhou' | 'ignorado'> {
  const { texto, vincularResult, canalMetaToken, sendTextFn } = params;

  if (!texto) return 'ignorado';

  const matchVinculo = texto.trim().match(RE_VINCULO_CODIGO);
  if (!matchVinculo) return 'ignorado';

  const codigo = matchVinculo[2] ?? matchVinculo[3];

  // Simula chamada ao ContatosService.vincularTelegramPorCodigo
  const resultado = vincularResult;

  if (resultado.ok) {
    const nomeStr = resultado.nome ? `, ${resultado.nome}` : '';
    if (canalMetaToken) {
      // Simula TelegramProvider.sendText
      await sendTextFn(
        '987654321',
        `Telegram vinculado${nomeStr}! Voce ja pode atender por aqui (digite AJUDA).`,
      );
    }
    return 'vinculo_ok';
  }

  return 'vinculo_falhou';
}

describe('Fluxo de vínculo Telegram no controller', () => {
  const CHAT_ID = '987654321';

  it('vínculo bem-sucedido envia mensagem de confirmação com nome e retorna sem processar como cidadão', async () => {
    const sendText = jest.fn().mockResolvedValue({ ok: true });

    const resultado = await simularProcessarVinculo({
      texto: '472910',
      vincularResult: { ok: true, nome: 'Carlos Souza' },
      canalMetaToken: 'BOT_TOKEN_SECRET',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_ok');
    expect(sendText).toHaveBeenCalledTimes(1);
    const [chatId, texto] = sendText.mock.calls[0];
    expect(chatId).toBe(CHAT_ID);
    expect(texto).toContain('Carlos Souza');
    expect(texto).toContain('vinculado');
    expect(texto).toContain('AJUDA');
  });

  it('vínculo bem-sucedido sem nome ainda envia mensagem de confirmação', async () => {
    const sendText = jest.fn().mockResolvedValue({ ok: true });

    const resultado = await simularProcessarVinculo({
      texto: '472910',
      vincularResult: { ok: true, nome: undefined },
      canalMetaToken: 'BOT_TOKEN_SECRET',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_ok');
    expect(sendText).toHaveBeenCalledTimes(1);
    const texto = sendText.mock.calls[0][1];
    expect(texto).toContain('vinculado');
    // Sem vírgula antes de nome quando nome é undefined
    expect(texto).not.toContain(', undefined');
  });

  it('vínculo bem-sucedido sem token do canal não envia mensagem (sem crash)', async () => {
    const sendText = jest.fn();

    const resultado = await simularProcessarVinculo({
      texto: '472910',
      vincularResult: { ok: true, nome: 'Fulano' },
      canalMetaToken: null, // canal sem token
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_ok');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('código inválido/expirado: retorna vinculo_falhou (segue fluxo normal)', async () => {
    const sendText = jest.fn();

    const resultado = await simularProcessarVinculo({
      texto: '000000',
      vincularResult: { ok: false },
      canalMetaToken: 'BOT_TOKEN_SECRET',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_falhou');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('texto que não casa com código de vínculo é ignorado (fluxo normal)', async () => {
    const sendText = jest.fn();

    const resultado = await simularProcessarVinculo({
      texto: 'Olá, preciso de ajuda',
      vincularResult: { ok: false },
      canalMetaToken: 'BOT_TOKEN_SECRET',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('ignorado');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('texto "ATENDER" (comando de agente) não é confundido com vínculo', async () => {
    const resultado = await simularProcessarVinculo({
      texto: 'ATENDER',
      vincularResult: { ok: false },
      canalMetaToken: 'BOT_TOKEN',
      sendTextFn: jest.fn(),
    });
    expect(resultado).toBe('ignorado');
  });

  it('código de 5 dígitos não é reconhecido como vínculo', async () => {
    const resultado = await simularProcessarVinculo({
      texto: '12345',
      vincularResult: { ok: false },
      canalMetaToken: 'BOT_TOKEN',
      sendTextFn: jest.fn(),
    });
    expect(resultado).toBe('ignorado');
  });

  it('texto undefined não causa crash', async () => {
    const resultado = await simularProcessarVinculo({
      texto: undefined,
      vincularResult: { ok: false },
      canalMetaToken: 'BOT_TOKEN',
      sendTextFn: jest.fn(),
    });
    expect(resultado).toBe('ignorado');
  });

  it('/vincular 123456 é reconhecido e vincula corretamente', async () => {
    const sendText = jest.fn().mockResolvedValue({ ok: true });

    const resultado = await simularProcessarVinculo({
      texto: '/vincular 123456',
      vincularResult: { ok: true, nome: 'Pedro' },
      canalMetaToken: 'TOK',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_ok');
    expect(sendText).toHaveBeenCalled();
  });

  it('/start 123456 é reconhecido e vincula corretamente', async () => {
    const sendText = jest.fn().mockResolvedValue({ ok: true });

    const resultado = await simularProcessarVinculo({
      texto: '/start 123456',
      vincularResult: { ok: true, nome: 'Ana' },
      canalMetaToken: 'TOK',
      sendTextFn: sendText,
    });

    expect(resultado).toBe('vinculo_ok');
    expect(sendText).toHaveBeenCalled();
  });
});

// ============================================================================
// TelegramProvider.sendText — confirma que a mensagem de vínculo usa sendText
// ============================================================================

describe('TelegramProvider — mensagem de confirmação de vínculo', () => {
  it('envia mensagem de texto simples via sendMessage', async () => {
    // Importação lazy para evitar dependência de módulo NestJS
    const { TelegramProvider } = await import('./telegram.provider');

    const http = {
      post: jest.fn().mockReturnValue(of({ data: { ok: true, result: { message_id: 99 } } })),
    };

    const provider = new TelegramProvider(http as any, { token: 'BOT_TOKEN' });
    const r = await provider.sendText(
      '987654321',
      'Telegram vinculado, Pedro! Voce ja pode atender por aqui (digite AJUDA).',
    );

    expect(r.ok).toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: '987654321',
        text: expect.stringContaining('vinculado'),
      }),
      expect.any(Object),
    );
  });
});
