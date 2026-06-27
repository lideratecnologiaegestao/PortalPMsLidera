import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  ButtonsInput,
  InboundMessage,
  ListInput,
  MediaInput,
  ProviderNome,
  SendResult,
  TemplateInput,
  WhatsappProvider,
} from './whatsapp-provider.interface';

export interface TelegramCreds {
  /** Token do bot gerado pelo BotFather. */
  token: string;
}

const TELEGRAM_API = 'https://api.telegram.org';

/**
 * Provider Telegram Bot API.
 *
 * Reusa a coluna `metaToken` do canal como bot token.
 * `metaVerifyToken` é o secret_token enviado pelo Telegram no header
 * X-Telegram-Bot-Api-Secret-Token (validação do webhook).
 * `webhookSecret` identifica o canal no path /webhooks/telegram/:secret.
 *
 * Saída: POST /bot{token}/sendMessage → {chat_id, text}.
 * Entrada: updates Telegram via TelegramWebhookController.
 *
 * NUNCA logar o bot token em claro.
 *
 * Doc: https://core.telegram.org/bots/api
 */
export class TelegramProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'meta';
  private readonly log = new Logger(TelegramProvider.name);

  constructor(
    private readonly http: HttpService,
    private readonly creds: TelegramCreds,
  ) {}

  private get baseUrl(): string {
    return `${TELEGRAM_API}/bot${this.creds.token}`;
  }

  async sendText(chatId: string, message: string): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/sendMessage`,
          { chat_id: chatId, text: message },
          { timeout: 20000 },
        ),
      );
      const result = (resp.data as { result?: { message_id?: number } })?.result;
      return { ok: true, id: result?.message_id !== undefined ? String(result.message_id) : undefined };
    } catch (e) {
      const err = e as { response?: { data?: { description?: string } }; message?: string };
      const motivo = err.response?.data?.description ?? err.message ?? 'erro desconhecido';
      return { ok: false, erro: motivo };
    }
  }

  async sendMedia(chatId: string, media: MediaInput, caption?: string): Promise<SendResult> {
    if (!media.url) {
      return { ok: false, erro: 'Telegram exige URL pública para envio de mídia.' };
    }
    try {
      const endpoint = media.tipo === 'image' ? 'sendPhoto' : 'sendDocument';
      const field = media.tipo === 'image' ? 'photo' : 'document';
      const body: Record<string, unknown> = { chat_id: chatId, [field]: media.url };
      if (caption) body.caption = caption;
      const resp = await firstValueFrom(
        this.http.post(`${this.baseUrl}/${endpoint}`, body, { timeout: 20000 }),
      );
      const result = (resp.data as { result?: { message_id?: number } })?.result;
      return { ok: true, id: result?.message_id !== undefined ? String(result.message_id) : undefined };
    } catch (e) {
      const err = e as { response?: { data?: { description?: string } }; message?: string };
      return { ok: false, erro: err.response?.data?.description ?? err.message };
    }
  }

  /**
   * Envia botões como inline keyboard nativo do Telegram.
   * Cada botão ocupa uma linha; callback_data = id (valor que o bot já entende).
   * Se QUALQUER id exceder 64 bytes UTF-8 (limite do Telegram), degrada para
   * texto simples para evitar truncamento silencioso que quebraria a lógica do bot.
   */
  async sendButtons(chatId: string, payload: ButtonsInput): Promise<SendResult> {
    const temIdLongo = payload.buttons.some(
      (b) => Buffer.byteLength(b.id, 'utf8') > 64,
    );
    if (temIdLongo) {
      const opcoes = payload.buttons.map((b) => `• ${b.label}`).join('\n');
      return this.sendText(chatId, `${payload.message}\n\n${opcoes}`);
    }

    const inline_keyboard = payload.buttons.map((b) => [
      { text: b.label.slice(0, 64), callback_data: b.id },
    ]);

    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/sendMessage`,
          {
            chat_id: chatId,
            text: payload.message,
            reply_markup: { inline_keyboard },
          },
          { timeout: 20000 },
        ),
      );
      const result = (resp.data as { result?: { message_id?: number } })?.result;
      return { ok: true, id: result?.message_id !== undefined ? String(result.message_id) : undefined };
    } catch (e) {
      const err = e as { response?: { data?: { description?: string } }; message?: string };
      return { ok: false, erro: err.response?.data?.description ?? err.message ?? 'erro desconhecido' };
    }
  }

  /**
   * Envia lista como inline keyboard nativo do Telegram (1 botão por linha).
   * callback_data = row.id (valor que o bot já entende).
   * Se QUALQUER id exceder 64 bytes UTF-8 (limite do Telegram), degrada para
   * texto numerado para evitar truncamento silencioso.
   */
  async sendList(chatId: string, payload: ListInput): Promise<SendResult> {
    const temIdLongo = payload.rows.some(
      (r) => Buffer.byteLength(r.id, 'utf8') > 64,
    );
    if (temIdLongo) {
      const linhas = payload.rows.map((r, i) => `${i + 1}. ${r.label}`).join('\n');
      return this.sendText(chatId, `${payload.message}\n\n${linhas}`);
    }

    const inline_keyboard = payload.rows.map((r) => [
      { text: r.label.slice(0, 64), callback_data: r.id },
    ]);

    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/sendMessage`,
          {
            chat_id: chatId,
            text: payload.message,
            reply_markup: { inline_keyboard },
          },
          { timeout: 20000 },
        ),
      );
      const result = (resp.data as { result?: { message_id?: number } })?.result;
      return { ok: true, id: result?.message_id !== undefined ? String(result.message_id) : undefined };
    } catch (e) {
      const err = e as { response?: { data?: { description?: string } }; message?: string };
      return { ok: false, erro: err.response?.data?.description ?? err.message ?? 'erro desconhecido' };
    }
  }

  /**
   * Responde ao Telegram confirmando o processamento de um callback_query.
   * Remove o ícone de "carregando" (relógio) exibido sobre o botão pressionado.
   * Best-effort: captura erros sem lançar.
   */
  async answerCallback(callbackQueryId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/answerCallbackQuery`,
          { callback_query_id: callbackQueryId },
          { timeout: 10000 },
        ),
      );
    } catch (e) {
      const err = e as { message?: string };
      this.log.debug(`answerCallbackQuery falhou (best-effort): ${err.message ?? 'erro desconhecido'}`);
    }
  }

  /** Templates HSM não são suportados no Telegram. */
  async sendTemplate(chatId: string, template: TemplateInput): Promise<SendResult> {
    // Degrada para texto com o nome do template
    return this.sendText(chatId, `(${template.nome})`);
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${this.baseUrl}/getMe`, { timeout: 10000 }),
      );
      const result = (resp.data as { ok?: boolean; result?: { username?: string; first_name?: string } })?.result;
      return {
        conectado: true,
        detalhe: `Telegram: @${result?.username ?? result?.first_name ?? 'desconhecido'}`,
      };
    } catch (e) {
      const err = e as { response?: { data?: { description?: string } }; message?: string };
      return { conectado: false, detalhe: err.response?.data?.description ?? err.message };
    }
  }

  /**
   * Normaliza um update do Telegram para InboundMessage.
   *
   * Suporta dois tipos de update:
   * - message: {message_id, from, chat:{id}, text} — mensagem de texto normal.
   * - callback_query: {id, data, from, message:{chat:{id}}} — toque em botão inline.
   *   O `texto` retornado é o `data` do botão (= o id/valor que o bot entende).
   *   O `messageId` usa o prefixo 'cbq-' para garantir idempotência separada.
   *
   * Ignora updates sem texto/data utilizável (fotos, stickers, delivery, etc.).
   */
  parseInbound(raw: unknown): InboundMessage | null {
    try {
      const update = raw as {
        update_id?: number;
        message?: {
          message_id?: number;
          from?: { id?: number; first_name?: string; username?: string };
          chat?: { id?: number };
          text?: string;
        };
        callback_query?: {
          id?: string;
          data?: string;
          from?: { id?: number; first_name?: string; username?: string };
          message?: {
            chat?: { id?: number };
          };
        };
      };

      // Toque em botão inline keyboard.
      if (update.callback_query) {
        const cbq = update.callback_query;
        if (!cbq.id || !cbq.data) return null;

        // Usa message.chat.id para garantir que o from bate com a conversa existente.
        const chatId = cbq.message?.chat?.id ?? cbq.from?.id;
        if (!chatId) return null;

        return {
          messageId: `cbq-${cbq.id}`,
          from: String(chatId),
          texto: cbq.data,
          tipo: 'callback',
          nome: cbq.from?.first_name,
        };
      }

      // Mensagem de texto normal.
      const msg = update.message;
      if (!msg || !msg.text) return null;
      if (msg.message_id === undefined || !msg.chat?.id) return null;

      return {
        messageId: String(msg.message_id),
        from: String(msg.chat.id),
        texto: msg.text,
        tipo: 'telegram',
        nome: msg.from?.first_name,
      };
    } catch {
      return null;
    }
  }
}
