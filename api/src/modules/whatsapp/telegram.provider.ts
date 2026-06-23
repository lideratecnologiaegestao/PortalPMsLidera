import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  ButtonsInput,
  InboundMessage,
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

  /** Degrada botões para texto simples com opções listadas. */
  async sendButtons(chatId: string, payload: ButtonsInput): Promise<SendResult> {
    const opcoes = payload.buttons.map((b) => `• ${b.label}`).join('\n');
    return this.sendText(chatId, `${payload.message}\n\n${opcoes}`);
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
   * Estrutura: {update_id, message:{message_id, from:{id,first_name,username}, chat:{id}, text}}.
   * Ignora updates sem message.text (fotos, stickers, etc.).
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
      };

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
