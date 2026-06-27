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

export interface ZApiCreds {
  baseUrl: string;
  instanceId: string;
  token: string;
  clientToken: string;
}

/**
 * Provider Z-API.
 * Base: {baseUrl}/{instanceId}/token/{token}/<acao>
 * Header obrigatório: Client-Token: {clientToken}
 * Telefone: 55 + DDD + dígitos (ex.: 5565999990000).
 *
 * Endpoints confirmados via developer.z-api.io:
 *   POST /send-text         { phone, message }
 *   POST /send-image        { phone, image(url|base64), fileName?, caption? }
 *   POST /send-document/{ext} { phone, document(url|base64), fileName?, caption? }
 *   POST /send-button-list  { TODO: confirmar campo exato na doc atual }
 *   GET  /status
 *   PUT  update-webhook-*   { value: url }
 */
export class ZApiProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'zapi';
  private readonly log = new Logger(ZApiProvider.name);
  private readonly base: string;

  constructor(
    private readonly http: HttpService,
    private readonly creds: ZApiCreds,
  ) {
    this.base = `${creds.baseUrl}/${creds.instanceId}/token/${creds.token}`;
  }

  private get headers(): Record<string, string> {
    // Client-Token só é enviado se configurado (opcional na Z-API).
    return this.creds.clientToken ? { 'Client-Token': this.creds.clientToken } : {};
  }

  /** Normaliza para E.164 BR (só dígitos, com DDI 55). */
  private normalizar(numero: string): string {
    const d = numero.replace(/\D/g, '');
    return d.startsWith('55') ? d : `55${d}`;
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.base}/send-text`,
          { phone: this.normalizar(to), message },
          { headers: this.headers, timeout: 12000 },
        ),
      );
      const data = resp.data as { zaapId?: string; messageId?: string; id?: string };
      return { ok: true, id: data?.zaapId ?? data?.messageId ?? data?.id };
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
      const phone = this.normalizar(to);
      if (media.tipo === 'image') {
        const body: Record<string, unknown> = { phone, caption: caption ?? '' };
        if (media.url) body.image = media.url;
        else if (media.base64) body.image = media.base64;
        if (media.fileName) body.fileName = media.fileName;

        const resp = await firstValueFrom(
          this.http.post(`${this.base}/send-image`, body, {
            headers: this.headers,
            timeout: 30000,
          }),
        );
        const data = resp.data as { zaapId?: string; messageId?: string; id?: string };
        return { ok: true, id: data?.zaapId ?? data?.messageId ?? data?.id };
      }

      // Documento — extrai extensão do fileName ou padrão 'pdf'
      const ext = media.fileName?.split('.').pop()?.toLowerCase() ?? 'pdf';
      const body: Record<string, unknown> = { phone, caption: caption ?? '', fileName: media.fileName ?? 'documento' };
      if (media.url) body.document = media.url;
      else if (media.base64) body.document = media.base64;

      const resp = await firstValueFrom(
        this.http.post(`${this.base}/send-document/${ext}`, body, {
          headers: this.headers,
          timeout: 30000,
        }),
      );
      const data = resp.data as { zaapId?: string; messageId?: string; id?: string };
      return { ok: true, id: data?.zaapId ?? data?.messageId ?? data?.id };
    } catch (e) {
      return { ok: false, erro: (e as Error).message };
    }
  }

  /**
   * Envia mensagem com botões via Z-API.
   *
   * TODO: confirmar o campo exato na doc atual da Z-API (developer.z-api.io → /send-button-list).
   * A doc referencia `/send-button-list` com corpo `{ phone, message, buttonList: { buttons: [{id,label}] } }`.
   * Como fallback de segurança, se a chamada falhar, envia como texto simples com opções numeradas.
   */
  async sendButtons(to: string, payload: ButtonsInput): Promise<SendResult> {
    const phone = this.normalizar(to);
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${this.base}/send-button-list`,
          {
            phone,
            message: payload.message,
            buttonList: {
              buttons: payload.buttons.map((b) => ({ id: b.id, label: b.label })),
            },
          },
          { headers: this.headers, timeout: 12000 },
        ),
      );
      const data = resp.data as { zaapId?: string; messageId?: string; id?: string };
      return { ok: true, id: data?.zaapId ?? data?.messageId ?? data?.id };
    } catch {
      // Fallback: texto numerado (compatível com qualquer conta Z-API)
      const opcoes = payload.buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
      return this.sendText(to, `${payload.message}\n\n${opcoes}`);
    }
  }

  /**
   * Envia lista de opções via Z-API.
   *
   * NOTA: A Z-API não documenta de forma confiável um endpoint de lista interativa
   * equivalente ao `interactive.type='list'` da Meta Cloud API.
   * O endpoint `/send-button-list` da Z-API suporta botões simples (≤3), não listas.
   * Por segurança, este método usa SEMPRE o fallback de texto numerado para Z-API,
   * garantindo entrega mesmo em contas sem suporte a botões interativos.
   * Se/quando a Z-API documentar um endpoint de lista confiável, substituir aqui.
   */
  async sendList(to: string, payload: ListInput): Promise<SendResult> {
    // Fallback: texto numerado (compatível com qualquer conta Z-API)
    const linhas = payload.rows.map((r, i) => `${i + 1}. ${r.label}`).join('\n');
    return this.sendText(to, `${payload.message}\n\n${linhas}`);
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    try {
      const resp = await firstValueFrom(
        this.http.get(`${this.base}/status`, {
          headers: this.headers,
          timeout: 8000,
        }),
      );
      const data = resp.data as { connected?: boolean; status?: string; value?: string };
      const conectado = data?.connected ?? (data?.status === 'connected') ?? false;
      return { conectado, detalhe: data?.status ?? String(data?.connected ?? '') };
    } catch (e) {
      return { conectado: false, detalhe: (e as Error).message };
    }
  }

  /**
   * Normaliza o payload de entrada da Z-API para InboundMessage.
   *
   * A Z-API envia POST com campo `type` indicando o evento:
   *   ReceivedCallback        → mensagem recebida
   *   DeliveryCallback        → status de envio
   *   MessageStatusCallback   → recebido/lido/respondido
   *   ConnectedCallback       → instância conectou
   *   DisconnectedCallback    → instância desconectou
   *
   * Para mensagens recebidas (ReceivedCallback), o payload tipicamente tem:
   *   phone / senderPhone / from → número do remetente
   *   text.message              → texto da mensagem
   *   messageId / zaapId        → ID único
   *   senderName / chatName     → nome do remetente
   *   instanceId                → identificador da instância
   *
   * Tratamento defensivo: se algum campo mudar de versão, retorna null
   * para evitar processar dados inválidos.
   */
  parseInbound(raw: unknown): InboundMessage | null {
    try {
      const body = raw as Record<string, unknown>;
      const type = String(body.type ?? '');

      // Apenas mensagens recebidas geram InboundMessage
      if (type !== 'ReceivedCallback') return null;

      // Telefone do remetente
      const phone = String(
        body.phone ?? body.senderPhone ?? body.from ?? '',
      ).replace(/\D/g, '');
      if (!phone) return null;

      // Texto da mensagem.
      // Preferir o `buttonResponseMessage.selectedButtonId` / `listResponseMessage.listType`
      // (resposta a botão/lista interativa) ao texto livre — o bot popula o id com o `valor`.
      const buttonResp = body.buttonResponseMessage as Record<string, unknown> | undefined;
      const listResp = body.listResponseMessage as Record<string, unknown> | undefined;
      const textObj = body.text as Record<string, unknown> | undefined;
      const texto = String(
        // Resposta a botão interativo Z-API: selectedButtonId carrega o `valor`
        buttonResp?.selectedButtonId ??
        // Resposta a lista interativa Z-API: selectedRowId carrega o `valor`
        listResp?.selectedRowId ??
        textObj?.message ??
        body.message ??
        body.body ??
        '',
      ) || undefined;

      // ID da mensagem
      const messageId = String(
        body.messageId ??
        body.zaapId ??
        body.id ??
        `zapi-${Date.now()}`,
      );

      // Nome do remetente (best-effort)
      const nome = String(body.senderName ?? body.chatName ?? '') || undefined;

      // Instância (para validação multi-tenant)
      const instancia = String(body.instanceId ?? body.instance ?? '') || undefined;

      return { messageId, from: phone, texto, tipo: type, nome, instancia };
    } catch {
      return null;
    }
  }
}
