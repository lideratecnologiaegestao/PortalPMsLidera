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

export interface InstagramCreds {
  /** ID da Página Facebook ou da conta Instagram Business (/{pageOrIgId}/messages). */
  pageOrIgId: string;
  /** Page Access Token com permissões instagram_manage_messages. */
  token: string;
  /** Versão da Graph API. */
  apiVersion?: string;
}

const GRAPH = 'https://graph.facebook.com';

/**
 * Provider Instagram Direct — Messenger Platform para Instagram.
 *
 * Reusa as colunas Meta do canal (metaPhoneNumberId = page/IG account ID,
 * metaToken = Page Access Token). A Graph API de saída é diferente da Cloud
 * API de WhatsApp: não há templates HSM nem botões interativos disponíveis via
 * Instagram Direct Messaging API (apenas text/generic template IG).
 *
 * Doc: https://developers.facebook.com/docs/messenger-platform/instagram
 *
 * NUNCA logar o token em claro.
 */
export class InstagramProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'meta';
  private readonly log = new Logger(InstagramProvider.name);
  private readonly v: string;

  constructor(
    private readonly http: HttpService,
    private readonly creds: InstagramCreds,
  ) {
    this.v = creds.apiVersion ?? 'v21.0';
  }

  private get messagesUrl(): string {
    return `${GRAPH}/${this.v}/${this.creds.pageOrIgId}/messages`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.creds.token}`,
      'Content-Type': 'application/json',
    };
  }

  /** Extrai message_id da resposta da Graph API do Instagram. */
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
      message: { text: message },
    });
  }

  /** Instagram Direct não suporta envio de mídia via este endpoint de forma confiável. */
  async sendMedia(_to: string, _media: MediaInput, _caption?: string): Promise<SendResult> {
    return { ok: false, erro: 'não suportado no Instagram Direct via Messenger Platform' };
  }

  /** Instagram Direct não tem botões interativos de resposta rápida via esta API. */
  async sendButtons(to: string, payload: ButtonsInput): Promise<SendResult> {
    // Degrada para texto simples com as opções listadas
    const opcoes = payload.buttons.map((b) => `• ${b.label}`).join('\n');
    return this.sendText(to, `${payload.message}\n\n${opcoes}`);
  }

  /** Templates HSM não são suportados no Instagram Direct. */
  async sendTemplate(_to: string, _template: TemplateInput): Promise<SendResult> {
    return { ok: false, erro: 'não suportado no Instagram Direct (sem templates HSM)' };
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${GRAPH}/${this.v}/${this.creds.pageOrIgId}`, {
          headers: { Authorization: `Bearer ${this.creds.token}` },
          params: { fields: 'id,username' },
          timeout: 10000,
        }),
      );
      const d = resp.data as { id?: string; username?: string };
      return {
        conectado: true,
        detalhe: `Instagram: @${d.username ?? d.id ?? 'desconhecido'}`,
      };
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      return { conectado: false, detalhe: err.response?.data?.error?.message ?? err.message };
    }
  }

  /**
   * Normaliza o payload do webhook `object:'instagram'` para InboundMessage.
   * Estrutura: entry[].messaging[].{sender:{id}, message:{mid,text}}.
   * Ignora echoes (message.is_echo) e eventos sem texto.
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

      if (body.object !== 'instagram') return null;

      const entry = body.entry?.[0];
      const messaging = entry?.messaging?.[0];
      const msg = messaging?.message;

      if (!msg || msg.is_echo) return null;
      if (!messaging?.sender?.id || !msg.mid) return null;

      return {
        messageId: msg.mid,
        from: messaging.sender.id,
        texto: msg.text,
        tipo: 'instagram',
        instancia: entry?.id,
      };
    } catch {
      return null;
    }
  }
}
