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

export interface MetaCreds {
  /** ID do número de telefone na Graph API (/{phoneNumberId}/messages). */
  phoneNumberId: string;
  /** Access token permanente (System User do Business Manager). */
  token: string;
  /** Versão da Graph API. */
  apiVersion?: string;
}

const GRAPH = 'https://graph.facebook.com';

/**
 * Provider OFICIAL da Meta — WhatsApp Business Cloud API (Graph API).
 *
 * É o caminho exigido por editais públicos ("API oficial da Meta") e elimina a
 * dependência de gateways não oficiais (Z-API/Evolution). Suporta:
 *  - sendText / sendMedia / sendButtons (interativo) / sendTemplate (HSM)
 *  - getStatus (consulta o phone number)
 *  - parseInbound (normaliza o payload do webhook `whatsapp_business_account`)
 *
 * Autenticação: Bearer <token>. O webhook é validado por assinatura
 * HMAC-SHA256 (X-Hub-Signature-256) no controller, com o App Secret.
 *
 * Doc: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class MetaCloudProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'meta';
  private readonly log = new Logger(MetaCloudProvider.name);
  private readonly v: string;

  constructor(
    private readonly http: HttpService,
    private readonly creds: MetaCreds,
  ) {
    this.v = creds.apiVersion ?? 'v21.0';
  }

  private get url(): string {
    return `${GRAPH}/${this.v}/${this.creds.phoneNumberId}/messages`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.creds.token}`,
      'Content-Type': 'application/json',
    };
  }

  /** E.164 sem '+', só dígitos com DDI. Acrescenta 55 (BR) quando ausente. */
  private normalizar(numero: string): string {
    const d = numero.replace(/\D/g, '');
    return d.startsWith('55') ? d : `55${d}`;
  }

  /** Extrai o wamid do retorno da Graph API. */
  private idDe(data: unknown): string | undefined {
    const m = (data as { messages?: { id?: string }[] })?.messages?.[0];
    return m?.id;
  }

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(this.url, { messaging_product: 'whatsapp', ...body }, {
          headers: this.headers,
          timeout: 20000,
        }),
      );
      return { ok: true, id: this.idDe(resp.data) };
    } catch (e) {
      // A Graph API devolve { error: { message, code } } — extrai sem vazar token.
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const motivo = err.response?.data?.error?.message ?? err.message ?? 'erro desconhecido';
      return { ok: false, erro: motivo };
    }
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    return this.post({
      to: this.normalizar(to),
      type: 'text',
      text: { preview_url: true, body: message },
    });
  }

  async sendMedia(to: string, media: MediaInput, caption?: string): Promise<SendResult> {
    const tipo = media.tipo === 'image' ? 'image' : 'document';
    const conteudo: Record<string, unknown> = {};
    if (media.url) conteudo.link = media.url;
    // A Cloud API não aceita base64 inline no /messages — exige link público ou
    // media_id (upload prévio). Sem URL, falha explicitamente.
    if (!media.url) {
      return { ok: false, erro: 'Meta Cloud API exige URL pública de mídia (base64 não suportado no envio direto).' };
    }
    if (caption) conteudo.caption = caption;
    if (tipo === 'document' && media.fileName) conteudo.filename = media.fileName;
    return this.post({ to: this.normalizar(to), type: tipo, [tipo]: conteudo });
  }

  async sendButtons(to: string, payload: ButtonsInput): Promise<SendResult> {
    // A Meta limita a 3 botões de resposta rápida (reply buttons).
    // id ≤ 256 chars (usamos até 200 por segurança); title ≤ 20 chars.
    const buttons = payload.buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: { id: b.id.slice(0, 200), title: b.label.slice(0, 20) },
    }));
    return this.post({
      to: this.normalizar(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: payload.message },
        action: { buttons },
      },
    });
  }

  /**
   * Envia lista interativa (interactive.type='list') via Meta Cloud API.
   * Suporta até 10 linhas em 1 section.
   * Limites: button ≤ 20 chars, row.id ≤ 200 chars, row.title ≤ 24 chars.
   * O `row.id` carrega o `valor` da opção do bot (texto que o bot entende),
   * de modo que ao selecionar uma opção o bot recebe o valor correto sem
   * precisar fazer lookup adicional.
   */
  async sendList(to: string, payload: ListInput): Promise<SendResult> {
    const rows = payload.rows.slice(0, 10).map((r) => {
      const row: Record<string, string> = {
        id: r.id.slice(0, 200),
        title: r.label.slice(0, 24),
      };
      if (r.descricao) row.description = r.descricao.slice(0, 72);
      return row;
    });
    return this.post({
      to: this.normalizar(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: payload.message },
        action: {
          button: (payload.tituloBotao ?? 'Escolher').slice(0, 20),
          sections: [{ rows }],
        },
      },
    });
  }

  async sendTemplate(to: string, template: TemplateInput): Promise<SendResult> {
    const tpl: Record<string, unknown> = {
      name: template.nome,
      language: { code: template.idioma },
    };
    if (template.componentes?.length) tpl.components = template.componentes;
    return this.post({ to: this.normalizar(to), type: 'template', template: tpl });
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${GRAPH}/${this.v}/${this.creds.phoneNumberId}`, {
          headers: { Authorization: `Bearer ${this.creds.token}` },
          params: { fields: 'verified_name,quality_rating,display_phone_number' },
          timeout: 10000,
        }),
      );
      const d = resp.data as { display_phone_number?: string; quality_rating?: string };
      return {
        conectado: true,
        detalhe: `${d.display_phone_number ?? ''} (qualidade: ${d.quality_rating ?? 'n/d'})`.trim(),
      };
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      return { conectado: false, detalhe: err.response?.data?.error?.message ?? err.message };
    }
  }

  /**
   * Normaliza o payload do webhook `whatsapp_business_account` para InboundMessage.
   * Retorna null para statuses (entregue/lido) e payloads sem mensagem.
   * O phone_number_id (metadata) é exposto em `instancia` para validação multi-canal.
   */
  parseInbound(raw: unknown): InboundMessage | null {
    try {
      const body = raw as {
        object?: string;
        entry?: {
          changes?: {
            field?: string;
            value?: {
              metadata?: { phone_number_id?: string };
              contacts?: { profile?: { name?: string }; wa_id?: string }[];
              messages?: {
                from?: string;
                id?: string;
                type?: string;
                text?: { body?: string };
                button?: { text?: string };
                interactive?: {
                  button_reply?: { id?: string; title?: string };
                  list_reply?: { id?: string; title?: string };
                };
              }[];
            };
          }[];
        }[];
      };

      if (body.object !== 'whatsapp_business_account') return null;
      const value = body.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      if (!msg?.from || !msg.id) return null; // sem mensagem (status, etc.)

      // Preferir o `id` da resposta interativa — o bot popula o id com o `valor`
      // da opção (texto que o sistema já entende), evitando lookup adicional.
      // Fallback para title/text quando id não estiver disponível.
      const texto =
        msg.text?.body ??
        msg.button?.text ??
        msg.interactive?.button_reply?.id ??
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.id ??
        msg.interactive?.list_reply?.title ??
        undefined;

      const nome = value?.contacts?.[0]?.profile?.name;
      const phoneNumberId = value?.metadata?.phone_number_id;

      return {
        messageId: msg.id,
        from: msg.from.replace(/\D/g, ''),
        texto,
        tipo: msg.type ?? 'text',
        nome,
        instancia: phoneNumberId || undefined,
      };
    } catch {
      return null;
    }
  }
}
