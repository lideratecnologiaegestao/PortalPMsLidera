import {
  ButtonsInput,
  InboundMessage,
  MediaInput,
  ProviderNome,
  SendResult,
  WhatsappProvider,
} from './whatsapp-provider.interface';

/**
 * Stub do provider Meta Cloud (API Oficial do WhatsApp Business).
 * Não implementado — caminho futuro para eliminar dependência de APIs não oficiais
 * (Z-API/Evolution) em casos críticos. Ver ADR sobre adapter de WhatsApp.
 *
 * Ao implementar: usar graph.facebook.com/v18.0/{phone_number_id}/messages,
 * autenticação via Bearer token, verificação de assinatura HMAC-SHA256
 * do header X-Hub-Signature-256.
 */
export class MetaCloudProvider implements WhatsappProvider {
  readonly nome: ProviderNome = 'meta';

  private naoImplementado(): never {
    throw new Error(
      'Meta Cloud API não implementada. Configure provider "zapi" ou "evolution".',
    );
  }

  async sendText(_to: string, _message: string): Promise<SendResult> {
    return this.naoImplementado();
  }

  async sendMedia(
    _to: string,
    _media: MediaInput,
    _caption?: string,
  ): Promise<SendResult> {
    return this.naoImplementado();
  }

  async sendButtons(
    _to: string,
    _payload: ButtonsInput,
  ): Promise<SendResult> {
    return this.naoImplementado();
  }

  async getStatus(): Promise<{ conectado: boolean; detalhe?: string }> {
    return this.naoImplementado();
  }

  parseInbound(_raw: unknown): InboundMessage | null {
    return this.naoImplementado();
  }
}
