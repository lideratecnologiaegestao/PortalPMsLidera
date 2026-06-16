/**
 * Contrato público de todo provider de WhatsApp.
 * Nenhum caller (service, controller, worker) fala com a API do provider
 * diretamente — apenas via esta interface. Isso permite trocar de provider
 * (Z-API → Evolution → Meta Cloud) sem reescrever chamadores.
 */

export interface SendResult {
  /** ID da mensagem retornado pelo provider (undefined se não houver). */
  id?: string;
  ok: boolean;
  erro?: string;
}

export interface MediaInput {
  /** URL pública da mídia (preferível). */
  url?: string;
  /** Base64 da mídia (fallback quando não há URL). */
  base64?: string;
  fileName?: string;
  tipo: 'image' | 'document';
}

export interface ButtonsInput {
  message: string;
  buttons: { id: string; label: string }[];
}

export interface InboundMessage {
  /** ID único da mensagem no provider — usado para idempotência. */
  messageId: string;
  /** Número do remetente (só dígitos, ex.: 5565999990000). */
  from: string;
  texto?: string;
  tipo: string;
  nome?: string;
  /** Identificador da instância/canal (para validar multi-tenant). */
  instancia?: string;
}

export type ProviderNome = 'zapi' | 'evolution' | 'meta';

export interface WhatsappProvider {
  readonly nome: ProviderNome;

  sendText(to: string, message: string): Promise<SendResult>;

  sendMedia(
    to: string,
    media: MediaInput,
    caption?: string,
  ): Promise<SendResult>;

  /** Opcional — providers que não suportam botões interativos podem omitir. */
  sendButtons?(to: string, payload: ButtonsInput): Promise<SendResult>;

  getStatus(): Promise<{ conectado: boolean; detalhe?: string }>;

  /**
   * Normaliza o payload bruto do webhook do provider para `InboundMessage`.
   * Retorna null para payloads que não são mensagem recebida (status, conexão…).
   */
  parseInbound(raw: unknown): InboundMessage | null;
}
