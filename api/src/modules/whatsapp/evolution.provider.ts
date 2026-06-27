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
  WhatsappProvider,
} from './whatsapp-provider.interface';

export interface EvolutionCreds {
  apiUrl: string;
  instance: string;
  apiKey: string;
}

/**
 * Provider Evolution API (mantido como fallback retrocompatível).
 * POST {apiUrl}/message/sendText/{instance} com header apikey.
 * Mesma lógica do whatsapp.service.ts original, agora atrás da interface.
 */
export class EvolutionProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'evolution';
  private readonly log = new Logger(EvolutionProvider.name);

  constructor(
    private readonly http: HttpService,
    private readonly creds: EvolutionCreds,
  ) {}

  /** Normaliza para E.164 BR (só dígitos, com DDI 55). */
  private normalizar(numero: string): string {
    const d = numero.replace(/\D/g, '');
    return d.startsWith('55') ? d : `55${d}`;
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.creds.apiUrl}/message/sendText/${this.creds.instance}`,
          { number: this.normalizar(to), text: message },
          { headers: { apikey: this.creds.apiKey }, timeout: 12000 },
        ),
      );
      const data = resp.data as { key?: { id?: string }; id?: string };
      return { ok: true, id: data?.key?.id ?? data?.id };
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  async sendMedia(
    to: string,
    media: MediaInput,
    caption?: string,
  ): Promise<SendResult> {
    try {
      const body: Record<string, unknown> = {
        number: this.normalizar(to),
        caption: caption ?? '',
        mediatype: media.tipo === 'image' ? 'image' : 'document',
        fileName: media.fileName ?? '',
      };
      if (media.url) body.media = media.url;
      else if (media.base64) body.media = media.base64;

      const resp = await firstValueFrom(
        this.http.post(
          `${this.creds.apiUrl}/message/sendMedia/${this.creds.instance}`,
          body,
          { headers: { apikey: this.creds.apiKey }, timeout: 30000 },
        ),
      );
      const data = resp.data as { key?: { id?: string }; id?: string };
      return { ok: true, id: data?.key?.id ?? data?.id };
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  async sendButtons(to: string, payload: ButtonsInput): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.creds.apiUrl}/message/sendButtons/${this.creds.instance}`,
          {
            number: this.normalizar(to),
            title: payload.message,
            buttons: payload.buttons.map((b) => ({ buttonId: b.id, buttonText: { displayText: b.label } })),
          },
          { headers: { apikey: this.creds.apiKey }, timeout: 12000 },
        ),
      );
      const data = resp.data as { key?: { id?: string }; id?: string };
      return { ok: true, id: data?.key?.id ?? data?.id };
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  /**
   * Envia lista de opções via Evolution API.
   *
   * NOTA: A Evolution API v2 possui endpoint de lista interativa, mas o suporte
   * varia por versão e pelo tipo de instância WhatsApp conectada. Para garantir
   * entrega confiável em todos os ambientes, este método usa fallback de texto
   * numerado — idêntico ao comportamento do sendButtons quando o endpoint falha.
   * O `id` de cada row carrega o `valor` da opção do bot.
   */
  async sendList(to: string, payload: ListInput): Promise<SendResult> {
    // Fallback: texto numerado (compatível com qualquer versão/instância Evolution)
    const linhas = payload.rows.map((r, i) => `${i + 1}. ${r.label}`).join('\n');
    return this.sendText(to, `${payload.message}\n\n${linhas}`);
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(
          `${this.creds.apiUrl}/instance/connectionState/${this.creds.instance}`,
          { headers: { apikey: this.creds.apiKey }, timeout: 8000 },
        ),
      );
      const data = resp.data as { instance?: { state?: string } };
      const state = data?.instance?.state ?? '';
      return { conectado: state === 'open', detalhe: state };
    } catch (e) {
      return { conectado: false, detalhe: (e as Error).message };
    }
  }

  /**
   * Normaliza payload da Evolution API para InboundMessage.
   * Trata variações defensivamente (best-effort).
   */
  parseInbound(raw: unknown): InboundMessage | null {
    try {
      const body = raw as Record<string, unknown>;
      const evento = String(body.event ?? body.type ?? '');
      if (!evento.toLowerCase().includes('message') || evento.toLowerCase().includes('update')) {
        return null;
      }

      const data = (body.data ?? body) as Record<string, unknown>;
      const key = (data.key ?? {}) as Record<string, unknown>;
      const jid = (key.remoteJid ?? data.remoteJid ?? '') as string;
      const numero = jid.split('@')[0];
      if (!numero) return null;

      const msg = (data.message ?? {}) as Record<string, unknown>;
      const texto =
        (msg.conversation as string) ||
        ((msg.extendedTextMessage as any)?.text as string) ||
        (data.text as string) ||
        undefined;

      const msgId = String(key.id ?? data.id ?? `ev-${Date.now()}`);
      const instancia = String(body.instance ?? data.instance ?? '');

      return {
        messageId: msgId,
        from: numero,
        texto,
        tipo: evento,
        nome: undefined,
        instancia: instancia || undefined,
      };
    } catch {
      return null;
    }
  }
}
