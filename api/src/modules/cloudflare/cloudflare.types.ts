/**
 * Tipos da API v4 da Cloudflare — recurso "Custom Hostnames"
 * (Cloudflare for SaaS). Cobrem apenas os campos que consumimos.
 * Ref.: https://developers.cloudflare.com/api/operations/custom-hostname-for-a-zone-create-custom-hostname
 */

/** Erro padronizado retornado pela Cloudflare em `errors[]`. */
export interface CloudflareApiError {
  code: number;
  message: string;
}

/** Envelope padrão de toda resposta da API v4. */
export interface CloudflareEnvelope<T> {
  success: boolean;
  errors: CloudflareApiError[];
  messages: { code: number; message: string }[];
  result: T;
}

/** Registro de validação (SSL DV via HTTP ou TXT). */
export interface CloudflareValidationRecord {
  http_url?: string;
  http_body?: string;
  txt_name?: string;
  txt_value?: string;
  emails?: string[];
}

/** Bloco SSL do custom hostname. */
export interface CloudflareCustomHostnameSsl {
  id?: string;
  type?: string; // 'dv'
  method?: string; // 'http' | 'txt' | 'email'
  status?: string; // pending_validation, active, ...
  validation_records?: CloudflareValidationRecord[];
  txt_name?: string;
  txt_value?: string;
}

/** Verificação de propriedade do hostname (quando exigida). */
export interface CloudflareOwnershipVerification {
  type?: string; // 'txt'
  name?: string;
  value?: string;
}
export interface CloudflareOwnershipVerificationHttp {
  http_url?: string;
  http_body?: string;
}

/** Recurso Custom Hostname retornado pela Cloudflare. */
export interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status: string; // pending, active, ...
  ssl: CloudflareCustomHostnameSsl;
  ownership_verification?: CloudflareOwnershipVerification;
  ownership_verification_http?: CloudflareOwnershipVerificationHttp;
  verification_errors?: string[];
  created_at?: string;
}

/**
 * Resultado limpo e normalizado devolvido pelo serviço — pronto para o app
 * salvar no banco e/ou exibir ao cliente para validação manual do domínio.
 */
export interface RegistroDominioResultado {
  /** ID do Custom Hostname na Cloudflare. */
  id: string;
  hostname: string;
  /** Status geral do hostname (pending, active, ...). */
  status: string;
  /** true se o hostname já existia na Cloudflare (onboarding idempotente). */
  jaExistia: boolean;
  ssl: {
    status?: string;
    method?: string;
    type?: string;
    /** Registros para o cliente provar o domínio (HTTP file ou TXT). */
    validationRecords: CloudflareValidationRecord[];
  };
  /** Verificação de propriedade (TXT/HTTP), quando a Cloudflare exigir. */
  ownershipVerification: {
    txtName?: string;
    txtValue?: string;
    httpUrl?: string;
    httpBody?: string;
  };
}
