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

export interface MessengerCreds {
  /** ID da Página Facebook (/{pageId}/messages). */
  pageId: string;
  /** Page Access Token com permissões pages_messaging. */
  token: string;
  /** Versão da Graph API. */
  apiVersion?: string;
}

const GRAPH = 'https://graph.facebook.com';

/**
 * Provider Facebook Messenger — Messenger Platform (Graph API).
 *
 * Reusa as colunas Meta do canal (metaPhoneNumberId = Page ID,
 * metaToken = Page Access Token). Endpoint de saída:
 *   POST /{pageId}/messages com messaging_type=RESPONSE.
 *
 * Autenticação: Bearer <token>.
 * Webhook: mesmo objeto `page` do Messenger Platform, entrada via
 * WhatsappMetaCanalWebhookController quando object === 'page'.
 *
 * NUNCA logar o token em claro.
 *
 * Doc: https://developers.facebook.com/docs/messenger-platform/send-messages
 */
export class MessengerProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'meta';
  private readonly log = new Logger(MessengerProvider.name);
  private readonly v: string;

  constructor(
    private readonly http: HttpService,
    private readonly creds: MessengerCreds,
  ) {
    this.v = creds.apiVersion ?? 'v21.0';
  }

  private get messagesUrl(): string {
    return `${GRAPH}/${this.v}/${this.creds.pageId}/messages`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.creds.token}`,
      'Content-Type': 'application/json',
    };
  }

  private idDe(data: unknown): string | undefined {
    return (data as { message_id?: string })?.message_id;
  }

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(this.messagesUrl, body, {
          headers: this.headers,
          timeout: 20000,
        }),
      );
      return { ok: true, id: this.idDe(resp.data) };
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const motivo = err.response?.data?.error?.message ?? err.message ?? 'erro desconhecido';
      return { ok: false, erro: motivo };
    }
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    return this.post({
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { text: message },
    });
  }

  /** Messenger não suporta envio de mídia via esta integração de forma confiável. */
  async sendMedia(_to: string, _media: MediaInput, _caption?: string): Promise<SendResult> {
    return { ok: false, erro: 'não suportado no Facebook Messenger via este provider' };
  }

  /** Degrada botões para texto simples com opções listadas. */
  async sendButtons(to: string, payload: ButtonsInput): Promise<SendResult> {
    const opcoes = payload.buttons.map((b) => `• ${b.label}`).join('\n');
    return this.sendText(to, `${payload.message}\n\n${opcoes}`);
  }

  /** Templates HSM não são suportados no Messenger. */
  async sendTemplate(_to: string, _template: TemplateInput): Promise<SendResult> {
    return { ok: false, erro: 'não suportado no Facebook Messenger (sem templates HSM)' };
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${GRAPH}/${this.v}/${this.creds.pageId}`, {
          headers: { Authorization: `Bearer ${this.creds.token}` },
          params: { fields: 'id,name' },
          timeout: 10000,
        }),
      );
      const d = resp.data as { id?: string; name?: string };
      return {
        conectado: true,
        detalhe: `Messenger: ${d.name ?? d.id ?? 'desconhecido'}`,
      };
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      return { conectado: false, detalhe: err.response?.data?.error?.message ?? err.message };
    }
  }

  /**
   * Normaliza o payload do webhook `object:'page'` para InboundMessage.
   * Estrutura: entry[].messaging[].{sender:{id}, message:{mid,text}}.
   * Ignora echoes (message.is_echo) e eventos sem texto (deliveries/reads).
   */
  parseInbound(raw: unknown): InboundMessage | null {
    try {
      const body = raw as {
        object?: string;
        entry?: {
          id?: string;
          messaging?: {
            sender?: { id?: string };
            recipient?: { id?: string };
            message?: {
              mid?: string;
              text?: string;
              is_echo?: boolean;
            };
          }[];
        }[];
      };

      if (body.object !== 'page') return null;

      const entry = body.entry?.[0];
      const messaging = entry?.messaging?.[0];
      const msg = messaging?.message;

      if (!msg || msg.is_echo) return null;
      if (!messaging?.sender?.id || !msg.mid) return null;
      // Ignora eventos sem texto (postbacks/deliveries/reads)
      if (!msg.text) return null;

      return {
        messageId: msg.mid,
        from: messaging.sender.id,
        texto: msg.text,
        tipo: 'messenger',
        instancia: entry?.id,
      };
    } catch {
      return null;
    }
  }
}
