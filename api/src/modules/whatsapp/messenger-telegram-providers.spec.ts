/**
 * Testes unitários dos providers Messenger e Telegram.
 *
 * Padrão: sem @nestjs/testing (conforme instrução do projeto).
 * Mocks mínimos — não dependem do banco nem do Redis.
 */

import { of, throwError } from 'rxjs';
import { MessengerProvider } from './messenger.provider';
import { TelegramProvider } from './telegram.provider';

// ---- Mock HttpService -------------------------------------------------------

function makeHttp(respData: unknown) {
  return {
    post: jest.fn().mockReturnValue(of({ data: respData })),
    get: jest.fn().mockReturnValue(of({ data: respData })),
  };
}

function makeHttpError(msg: string) {
  return {
    post: jest.fn().mockReturnValue(throwError(() => new Error(msg))),
    get: jest.fn().mockReturnValue(throwError(() => new Error(msg))),
  };
}

// ============================================================================
// MessengerProvider
// ============================================================================

describe('MessengerProvider', () => {
  const CREDS = { pageId: 'PAGE-001', token: 'PAGE_TOKEN_SECRET' };

  describe('sendText', () => {
    it('envia mensagem e retorna message_id', async () => {
      const http = makeHttp({ message_id: 'mid-messenger-001' });
      const p = new MessengerProvider(http as any, CREDS);

      const r = await p.sendText('USER_PSID_001', 'Olá via Messenger');

      expect(r.ok).toBe(true);
      expect(r.id).toBe('mid-messenger-001');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/PAGE-001/messages'),
        expect.objectContaining({
          recipient: { id: 'USER_PSID_001' },
          messaging_type: 'RESPONSE',
          message: { text: 'Olá via Messenger' },
        }),
        expect.any(Object),
      );
    });

    it('inclui Bearer token no header — NUNCA o token em claro no log', async () => {
      const http = makeHttp({ message_id: 'mid-001' });
      const p = new MessengerProvider(http as any, CREDS);

      await p.sendText('PSID', 'teste');

      const opts = http.post.mock.calls[0][2] as { headers: Record<string, string> };
      expect(opts.headers.Authorization).toBe('Bearer PAGE_TOKEN_SECRET');
    });

    it('retorna ok:false com mensagem de erro quando a Graph API falha', async () => {
      const http = makeHttpError('Unauthorized');
      const p = new MessengerProvider(http as any, CREDS);

      const r = await p.sendText('PSID', 'teste');

      expect(r.ok).toBe(false);
      expect(r.erro).toContain('Unauthorized');
    });
  });

  describe('sendMedia', () => {
    it('retorna ok:false (não suportado)', async () => {
      const p = new MessengerProvider(null as any, CREDS);
      const r = await p.sendMedia('PSID', { tipo: 'image', url: 'https://example.com/img.jpg' });
      expect(r.ok).toBe(false);
      expect(r.erro).toContain('não suportado');
    });
  });

  describe('sendButtons', () => {
    it('degrada para texto simples com opções listadas', async () => {
      const http = makeHttp({ message_id: 'mid-002' });
      const p = new MessengerProvider(http as any, CREDS);

      await p.sendButtons('PSID', {
        message: 'Escolha uma opção:',
        buttons: [
          { id: 'a', label: 'Opção A' },
          { id: 'b', label: 'Opção B' },
        ],
      });

      const body = http.post.mock.calls[0][1] as { message: { text: string } };
      expect(body.message.text).toContain('Opção A');
      expect(body.message.text).toContain('Opção B');
    });
  });

  describe('sendTemplate', () => {
    it('retorna ok:false (não suportado)', async () => {
      const p = new MessengerProvider(null as any, CREDS);
      const r = await p.sendTemplate('PSID', { nome: 'template_x', idioma: 'pt_BR' });
      expect(r.ok).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('retorna conectado:true com nome da página', async () => {
      const http = makeHttp({ id: 'PAGE-001', name: 'Prefeitura de Exemplo' });
      const p = new MessengerProvider(http as any, CREDS);

      const s = await p.getStatus();

      expect(s.conectado).toBe(true);
      expect(s.detalhe).toContain('Prefeitura de Exemplo');
    });

    it('retorna conectado:false em erro de autenticação', async () => {
      const http = makeHttpError('Invalid OAuth access token');
      const p = new MessengerProvider(http as any, CREDS);

      const s = await p.getStatus();

      expect(s.conectado).toBe(false);
      expect(s.detalhe).toContain('Invalid OAuth');
    });
  });

  describe('parseInbound', () => {
    it('parseia payload object:page corretamente', () => {
      const p = new MessengerProvider(null as any, CREDS);

      const payload = {
        object: 'page',
        entry: [
          {
            id: 'PAGE-001',
            messaging: [
              {
                sender: { id: 'USER_PSID_001' },
                recipient: { id: 'PAGE-001' },
                message: { mid: 'mid-abc-123', text: 'Preciso de ajuda' },
              },
            ],
          },
        ],
      };

      const r = p.parseInbound(payload);

      expect(r).not.toBeNull();
      expect(r!.messageId).toBe('mid-abc-123');
      expect(r!.from).toBe('USER_PSID_001');
      expect(r!.texto).toBe('Preciso de ajuda');
      expect(r!.tipo).toBe('messenger');
      expect(r!.instancia).toBe('PAGE-001');
    });

    it('ignora echoes (is_echo=true)', () => {
      const p = new MessengerProvider(null as any, CREDS);

      const payload = {
        object: 'page',
        entry: [
          {
            id: 'PAGE-001',
            messaging: [
              {
                sender: { id: 'PAGE-001' },
                message: { mid: 'mid-echo', text: 'Echo', is_echo: true },
              },
            ],
          },
        ],
      };

      expect(p.parseInbound(payload)).toBeNull();
    });

    it('ignora payloads sem texto (delivery/read)', () => {
      const p = new MessengerProvider(null as any, CREDS);

      const payload = {
        object: 'page',
        entry: [
          {
            id: 'PAGE-001',
            messaging: [
              {
                sender: { id: 'USER_PSID_001' },
                delivery: { watermark: 123 },
                // sem message.text
              },
            ],
          },
        ],
      };

      expect(p.parseInbound(payload)).toBeNull();
    });

    it('retorna null para object:instagram (tipo errado)', () => {
      const p = new MessengerProvider(null as any, CREDS);
      expect(p.parseInbound({ object: 'instagram', entry: [] })).toBeNull();
    });

    it('retorna null para object:whatsapp_business_account (tipo errado)', () => {
      const p = new MessengerProvider(null as any, CREDS);
      expect(p.parseInbound({ object: 'whatsapp_business_account', entry: [] })).toBeNull();
    });
  });
});

// ============================================================================
// TelegramProvider
// ============================================================================

describe('TelegramProvider', () => {
  const CREDS = { token: 'BOT_TOKEN_SECRET' };

  describe('sendText', () => {
    it('envia mensagem e retorna message_id como string', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 42 } });
      const p = new TelegramProvider(http as any, CREDS);

      const r = await p.sendText('12345678', 'Olá via Telegram');

      expect(r.ok).toBe(true);
      expect(r.id).toBe('42');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        { chat_id: '12345678', text: 'Olá via Telegram' },
        expect.any(Object),
      );
    });

    it('URL contém o bot token — confirma roteamento correto', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 1 } });
      const p = new TelegramProvider(http as any, CREDS);

      await p.sendText('123', 'teste');

      const url = http.post.mock.calls[0][0] as string;
      expect(url).toContain('bot' + CREDS.token);
    });

    it('retorna ok:false com description em erro', async () => {
      const http = {
        post: jest.fn().mockReturnValue(
          throwError(() => ({
            response: { data: { description: 'chat not found' } },
            message: 'Request failed',
          })),
        ),
      };
      const p = new TelegramProvider(http as any, CREDS);

      const r = await p.sendText('0', 'teste');

      expect(r.ok).toBe(false);
      expect(r.erro).toContain('chat not found');
    });
  });

  describe('sendMedia', () => {
    it('envia foto com URL via sendPhoto', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 99 } });
      const p = new TelegramProvider(http as any, CREDS);

      const r = await p.sendMedia('12345', { tipo: 'image', url: 'https://example.com/img.png' }, 'legenda');

      expect(r.ok).toBe(true);
      const url = http.post.mock.calls[0][0] as string;
      expect(url).toContain('/sendPhoto');
    });

    it('retorna ok:false quando não há URL', async () => {
      const p = new TelegramProvider(null as any, CREDS);
      const r = await p.sendMedia('123', { tipo: 'image' });
      expect(r.ok).toBe(false);
      expect(r.erro).toContain('URL');
    });
  });

  describe('sendButtons', () => {
    it('envia inline keyboard nativo quando ids cabem em 64 bytes', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 10 } });
      const p = new TelegramProvider(http as any, CREDS);

      const r = await p.sendButtons('123', {
        message: 'Escolha:',
        buttons: [
          { id: 'sim', label: 'Sim' },
          { id: 'nao', label: 'Não' },
        ],
      });

      expect(r.ok).toBe(true);
      const body = http.post.mock.calls[0][1] as {
        chat_id: string;
        text: string;
        reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] };
      };
      expect(body.text).toBe('Escolha:');
      expect(body.reply_markup.inline_keyboard).toHaveLength(2);
      expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('sim');
      expect(body.reply_markup.inline_keyboard[1][0].callback_data).toBe('nao');
      expect(body.reply_markup.inline_keyboard[0][0].text).toBe('Sim');
    });

    it('cada botão ocupa uma linha (1 por linha)', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 11 } });
      const p = new TelegramProvider(http as any, CREDS);

      await p.sendButtons('123', {
        message: 'Menu:',
        buttons: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
      });

      const body = http.post.mock.calls[0][1] as {
        reply_markup: { inline_keyboard: unknown[][] };
      };
      // 3 botões = 3 linhas, cada linha tem 1 botão
      expect(body.reply_markup.inline_keyboard).toHaveLength(3);
      body.reply_markup.inline_keyboard.forEach((linha) => {
        expect(linha).toHaveLength(1);
      });
    });

    it('degrada para texto quando ALGUM id excede 64 bytes UTF-8', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 12 } });
      const p = new TelegramProvider(http as any, CREDS);

      const idLongo = 'x'.repeat(65); // 65 bytes — acima do limite
      await p.sendButtons('123', {
        message: 'Escolha:',
        buttons: [
          { id: 'curto', label: 'Curto' },
          { id: idLongo, label: 'Longo' },
        ],
      });

      const body = http.post.mock.calls[0][1] as { text: string; reply_markup?: unknown };
      // Deve ter degradado para texto (sem reply_markup)
      expect(body.reply_markup).toBeUndefined();
      expect(body.text).toContain('Curto');
      expect(body.text).toContain('Longo');
    });

    it('id com exatamente 64 bytes não dispara fallback', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 13 } });
      const p = new TelegramProvider(http as any, CREDS);

      const id64 = 'a'.repeat(64); // exatamente no limite — OK
      await p.sendButtons('123', {
        message: 'Menu:',
        buttons: [{ id: id64, label: 'Opção' }],
      });

      const body = http.post.mock.calls[0][1] as { reply_markup?: { inline_keyboard?: unknown } };
      expect(body.reply_markup?.inline_keyboard).toBeDefined();
    });
  });

  describe('sendTemplate', () => {
    it('degrada para texto com o nome do template', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 11 } });
      const p = new TelegramProvider(http as any, CREDS);

      await p.sendTemplate('123', { nome: 'boas_vindas', idioma: 'pt_BR' });

      const body = http.post.mock.calls[0][1] as { text: string };
      expect(body.text).toContain('boas_vindas');
    });
  });

  describe('getStatus', () => {
    it('retorna conectado:true com username', async () => {
      const http = makeHttp({ ok: true, result: { username: 'prefeitura_bot', first_name: 'Prefeitura' } });
      const p = new TelegramProvider(http as any, CREDS);

      const s = await p.getStatus();

      expect(s.conectado).toBe(true);
      expect(s.detalhe).toContain('@prefeitura_bot');
    });

    it('retorna conectado:false em erro de autenticação', async () => {
      const http = makeHttpError('Unauthorized');
      const p = new TelegramProvider(http as any, CREDS);

      const s = await p.getStatus();

      expect(s.conectado).toBe(false);
    });
  });

  describe('parseInbound', () => {
    it('parseia update com message.text corretamente', () => {
      const p = new TelegramProvider(null as any, CREDS);

      const update = {
        update_id: 100000001,
        message: {
          message_id: 1,
          from: { id: 987654321, first_name: 'Maria', username: 'maria_cidada' },
          chat: { id: 987654321 },
          text: 'Quero registrar uma denúncia',
        },
      };

      const r = p.parseInbound(update);

      expect(r).not.toBeNull();
      expect(r!.messageId).toBe('1');
      expect(r!.from).toBe('987654321');
      expect(r!.texto).toBe('Quero registrar uma denúncia');
      expect(r!.tipo).toBe('telegram');
      expect(r!.nome).toBe('Maria');
    });

    it('retorna null para update sem message.text (foto, sticker, etc.)', () => {
      const p = new TelegramProvider(null as any, CREDS);

      const update = {
        update_id: 100000002,
        message: {
          message_id: 2,
          from: { id: 123, first_name: 'João' },
          chat: { id: 123 },
          photo: [{ file_id: 'xxx', width: 100, height: 100 }],
          // sem text
        },
      };

      expect(p.parseInbound(update)).toBeNull();
    });

    it('parseia callback_query — toque em botão inline keyboard', () => {
      const p = new TelegramProvider(null as any, CREDS);

      const update = {
        update_id: 100000003,
        callback_query: {
          id: 'cbq-abc-999',
          data: 'menu_esic',
          from: { id: 987654321, first_name: 'Maria', username: 'maria_cidada' },
          message: {
            message_id: 50,
            chat: { id: 987654321 },
          },
        },
      };

      const r = p.parseInbound(update);

      expect(r).not.toBeNull();
      expect(r!.messageId).toBe('cbq-cbq-abc-999');
      expect(r!.from).toBe('987654321'); // chat.id, não from.id
      expect(r!.texto).toBe('menu_esic');
      expect(r!.tipo).toBe('callback');
      expect(r!.nome).toBe('Maria');
    });

    it('callback_query usa message.chat.id (não from.id) para bater com conversa existente', () => {
      const p = new TelegramProvider(null as any, CREDS);

      // Cenário: chat_id diferente de from.id (grupo, canal, etc.)
      const update = {
        callback_query: {
          id: 'cbq-xyz',
          data: 'opcao_1',
          from: { id: 111, first_name: 'João' },
          message: { chat: { id: 999 } }, // chat_id prevalece
        },
      };

      const r = p.parseInbound(update);
      expect(r).not.toBeNull();
      expect(r!.from).toBe('999');
    });

    it('callback_query sem message.chat usa from.id como fallback', () => {
      const p = new TelegramProvider(null as any, CREDS);

      const update = {
        callback_query: {
          id: 'cbq-fallback',
          data: 'opcao_x',
          from: { id: 555, first_name: 'Pedro' },
          // sem message.chat
        },
      };

      const r = p.parseInbound(update);
      expect(r).not.toBeNull();
      expect(r!.from).toBe('555');
    });

    it('retorna null para callback_query sem id ou sem data', () => {
      const p = new TelegramProvider(null as any, CREDS);

      // sem id
      expect(
        p.parseInbound({
          callback_query: { data: 'opcao', from: { id: 1 }, message: { chat: { id: 1 } } },
        }),
      ).toBeNull();

      // sem data
      expect(
        p.parseInbound({
          callback_query: { id: 'cbq-1', from: { id: 1 }, message: { chat: { id: 1 } } },
        }),
      ).toBeNull();
    });

    it('retorna null para payload malformado', () => {
      const p = new TelegramProvider(null as any, CREDS);
      expect(p.parseInbound(null)).toBeNull();
      expect(p.parseInbound({})).toBeNull();
      expect(p.parseInbound('string')).toBeNull();
    });
  });

  describe('sendList', () => {
    it('envia inline keyboard nativo quando ids cabem em 64 bytes', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 20 } });
      const p = new TelegramProvider(http as any, CREDS);

      const r = await p.sendList('456', {
        message: 'Selecione o serviço:',
        tituloBotao: 'Ver opções',
        rows: [
          { id: 'esic', label: 'e-SIC', descricao: 'Informações ao cidadão' },
          { id: 'ouvidoria', label: 'Ouvidoria', descricao: 'Reclamações e sugestões' },
          { id: 'protocolo', label: 'Protocolo', descricao: 'Consultar protocolo' },
        ],
      });

      expect(r.ok).toBe(true);
      const body = http.post.mock.calls[0][1] as {
        text: string;
        reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] };
      };
      expect(body.text).toBe('Selecione o serviço:');
      expect(body.reply_markup.inline_keyboard).toHaveLength(3);
      expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('esic');
      expect(body.reply_markup.inline_keyboard[1][0].callback_data).toBe('ouvidoria');
      expect(body.reply_markup.inline_keyboard[2][0].callback_data).toBe('protocolo');
    });

    it('degrada para texto numerado quando ALGUM id excede 64 bytes', async () => {
      const http = makeHttp({ ok: true, result: { message_id: 21 } });
      const p = new TelegramProvider(http as any, CREDS);

      const idLongo = 'z'.repeat(65);
      await p.sendList('456', {
        message: 'Escolha:',
        rows: [
          { id: 'curto', label: 'Curto' },
          { id: idLongo, label: 'Longo demais' },
        ],
      });

      const body = http.post.mock.calls[0][1] as { text: string; reply_markup?: unknown };
      expect(body.reply_markup).toBeUndefined();
      expect(body.text).toContain('1. Curto');
      expect(body.text).toContain('2. Longo demais');
    });
  });

  describe('answerCallback', () => {
    it('chama /answerCallbackQuery com o callback_query_id correto', async () => {
      const http = makeHttp({ ok: true });
      const p = new TelegramProvider(http as any, CREDS);

      await p.answerCallback('cbq-abc-123');

      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/answerCallbackQuery'),
        { callback_query_id: 'cbq-abc-123' },
        expect.any(Object),
      );
    });

    it('não lança em caso de erro (best-effort)', async () => {
      const http = makeHttpError('Bad Request');
      const p = new TelegramProvider(http as any, CREDS);

      // Não deve lançar
      await expect(p.answerCallback('cbq-err')).resolves.toBeUndefined();
    });

    it('URL inclui o bot token correto', async () => {
      const http = makeHttp({ ok: true });
      const p = new TelegramProvider(http as any, CREDS);

      await p.answerCallback('cbq-token-test');

      const url = http.post.mock.calls[0][0] as string;
      expect(url).toContain('bot' + CREDS.token);
    });
  });
});
