import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CloudflareApiError,
  CloudflareCustomHostname,
  CloudflareEnvelope,
  RegistroDominioResultado,
} from './cloudflare.types';

/** Código de erro da Cloudflare para "custom hostname já existe". */
const ERRO_HOSTNAME_DUPLICADO = 1406;

/**
 * Gerencia domínios customizados das prefeituras (tenants) via API v4 da
 * Cloudflare — recurso "Cloudflare for SaaS / Custom Hostnames".
 *
 * Quando uma prefeitura usa domínio próprio (ex.: transparencia.cidade.mt.gov.br),
 * registramos o hostname na zona da plataforma; a Cloudflare emite o certificado
 * (DV) e devolve os dados de validação (HTTP file ou TXT) que o cliente precisa
 * publicar no DNS dele. Este serviço é projetado para ser injetado no fluxo de
 * provisionamento de tenants sem quebrá-lo: domínio já existente é tratado como
 * sucesso (idempotente) e os erros da API são logados em detalhe.
 *
 * Fronteira de camadas: SOMENTE o backend fala com a Cloudflare; o token nunca
 * sai daqui. Config por env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID.
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly token: string;
  private readonly zoneId: string;
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.token = this.config.get<string>('CLOUDFLARE_API_TOKEN') ?? '';
    this.zoneId = this.config.get<string>('CLOUDFLARE_ZONE_ID') ?? '';
  }

  /** Há credenciais configuradas? Permite o provisionamento pular com segurança. */
  estaConfigurado(): boolean {
    return Boolean(this.token && this.zoneId);
  }

  /** Cabeçalhos de autenticação — estritamente Bearer Token. */
  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private get hostnamesUrl(): string {
    return `${this.baseUrl}/zones/${this.zoneId}/custom_hostnames`;
  }

  /**
   * Registra (ou reaproveita) um domínio customizado na Cloudflare com SSL DV
   * validado por HTTP. Idempotente: se o hostname já existe, retorna o existente
   * em vez de estourar — para não quebrar o onboarding do tenant no banco local.
   *
   * @returns ID do Custom Hostname + dados de validação (TXT/HTTP) para o
   *          cliente provar a propriedade do domínio.
   */
  async registrarDominioCustomizado(
    hostname: string,
  ): Promise<RegistroDominioResultado> {
    if (!this.estaConfigurado()) {
      throw new ServiceUnavailableException(
        'Integração Cloudflare não configurada (CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID).',
      );
    }

    const payload = {
      hostname,
      ssl: { method: 'http', type: 'dv' },
    };

    try {
      const { data } = await firstValueFrom(
        this.http.post<CloudflareEnvelope<CloudflareCustomHostname>>(
          this.hostnamesUrl,
          payload,
          { headers: this.headers },
        ),
      );

      // A Cloudflare pode responder 200 com success=false — trate como erro.
      if (!data.success) {
        return await this.tratarFalhaApi(hostname, data.errors, false);
      }

      this.logger.log(
        `Custom hostname registrado: ${hostname} (id=${data.result.id})`,
      );
      return this.normalizar(data.result, false);
    } catch (err) {
      const erros = this.extrairErros(err);
      return await this.tratarFalhaApi(hostname, erros, true);
    }
  }

  /**
   * Consulta o status/validação de um custom hostname já registrado (útil para
   * o painel acompanhar a validação do certificado pelo cliente).
   */
  async consultarPorHostname(
    hostname: string,
  ): Promise<RegistroDominioResultado | null> {
    if (!this.estaConfigurado()) return null;
    const existente = await this.buscarExistente(hostname);
    return existente ? this.normalizar(existente, true) : null;
  }

  // ---------------------------------------------------------------- internos

  /**
   * Decide o destino de uma falha: se for "hostname já existe", busca o existente
   * e retorna sucesso (idempotência do onboarding); caso contrário, loga os erros
   * detalhados da Cloudflare e estoura uma exceção significativa.
   */
  private async tratarFalhaApi(
    hostname: string,
    erros: CloudflareApiError[],
    veioDeExcecao: boolean,
  ): Promise<RegistroDominioResultado> {
    if (this.ehHostnameDuplicado(erros)) {
      this.logger.warn(
        `Hostname já existe na Cloudflare: ${hostname} — reaproveitando.`,
      );
      const existente = await this.buscarExistente(hostname);
      if (existente) return this.normalizar(existente, true);
      // Duplicado mas não encontrado na listagem (raro): segue como sucesso "vazio".
      this.logger.warn(
        `Hostname ${hostname} reportado como duplicado mas não localizado na listagem.`,
      );
    }

    // Loga os erros DETALHADOS da Cloudflare (não um genérico de rede).
    this.logger.error(
      `Falha ao registrar custom hostname "${hostname}" na Cloudflare: ${this.formatarErros(
        erros,
      )}`,
    );

    throw new BadGatewayException({
      message: `Cloudflare recusou o registro do domínio "${hostname}".`,
      cloudflareErrors: erros,
    });
  }

  /** Busca um custom hostname existente pelo nome (filtro nativo da API). */
  private async buscarExistente(
    hostname: string,
  ): Promise<CloudflareCustomHostname | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<CloudflareEnvelope<CloudflareCustomHostname[]>>(
          this.hostnamesUrl,
          { headers: this.headers, params: { hostname } },
        ),
      );
      if (!data.success || !Array.isArray(data.result)) return null;
      return (
        data.result.find(
          (h) => h.hostname?.toLowerCase() === hostname.toLowerCase(),
        ) ??
        data.result[0] ??
        null
      );
    } catch (err) {
      this.logger.error(
        `Falha ao consultar custom hostname "${hostname}": ${this.formatarErros(
          this.extrairErros(err),
        )}`,
      );
      return null;
    }
  }

  /** Extrai `response.data.errors` do AxiosError (sem mascarar com erro de rede). */
  private extrairErros(err: unknown): CloudflareApiError[] {
    const ax = err as AxiosError<CloudflareEnvelope<unknown>>;
    const erros = ax?.response?.data?.errors;
    if (Array.isArray(erros) && erros.length > 0) return erros;
    // Erro de rede/timeout (sem corpo da Cloudflare).
    return [{ code: 0, message: ax?.message ?? 'Erro desconhecido na Cloudflare.' }];
  }

  private ehHostnameDuplicado(erros: CloudflareApiError[]): boolean {
    return erros.some(
      (e) =>
        e.code === ERRO_HOSTNAME_DUPLICADO ||
        /already exists|duplicate/i.test(e.message ?? ''),
    );
  }

  private formatarErros(erros: CloudflareApiError[]): string {
    return erros.map((e) => `[${e.code}] ${e.message}`).join('; ');
  }

  /** Converte o recurso da Cloudflare no resultado limpo do serviço. */
  private normalizar(
    ch: CloudflareCustomHostname,
    jaExistia: boolean,
  ): RegistroDominioResultado {
    const ssl = ch.ssl ?? {};
    const records = ssl.validation_records ?? [];
    // Alguns retornos trazem txt_name/txt_value direto no ssl.
    if ((ssl.txt_name || ssl.txt_value) && records.length === 0) {
      records.push({ txt_name: ssl.txt_name, txt_value: ssl.txt_value });
    }
    return {
      id: ch.id,
      hostname: ch.hostname,
      status: ch.status,
      jaExistia,
      ssl: {
        status: ssl.status,
        method: ssl.method,
        type: ssl.type,
        validationRecords: records,
      },
      ownershipVerification: {
        txtName: ch.ownership_verification?.name,
        txtValue: ch.ownership_verification?.value,
        httpUrl: ch.ownership_verification_http?.http_url,
        httpBody: ch.ownership_verification_http?.http_body,
      },
    };
  }
}
