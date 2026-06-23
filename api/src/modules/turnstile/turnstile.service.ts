import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

/**
 * Validação do Cloudflare Turnstile (CAPTCHA invisível).
 *
 * - enabled = false enquanto as variáveis de ambiente não estiverem configuradas;
 *   nesse caso verificar() retorna true (degradação graciosa sem bloquear ninguém).
 * - Em erro de REDE/timeout da API do Cloudflare → fail-open (loga warning, retorna true).
 * - success:false da API → retorna false (token inválido/expirado).
 */
@Injectable()
export class TurnstileService {
  private readonly log = new Logger(TurnstileService.name);

  private readonly secret: string | null;
  private readonly siteKeyEnv: string | null;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('TURNSTILE_SECRET_KEY') ?? null;
    this.siteKeyEnv = this.config.get<string>('TURNSTILE_SITE_KEY') ?? null;
  }

  /** Retorna a config pública — consumida pelo endpoint GET /api/turnstile/config. */
  getConfig(): TurnstileConfig {
    return {
      enabled: Boolean(this.secret && this.siteKeyEnv),
      siteKey: this.siteKeyEnv,
    };
  }

  /**
   * Valida um token Turnstile.
   *
   * @param token  Token enviado pelo frontend (campo `cf-turnstile-response`).
   * @param ip     IP do cliente (X-Forwarded-For ou req.ip). Opcional mas recomendado.
   * @returns      `true` se aprovado (ou Turnstile desabilitado/erro de rede),
   *               `false` se reprovado pela API.
   */
  async verificar(token: string | undefined, ip?: string): Promise<boolean> {
    const { enabled } = this.getConfig();

    // Turnstile não configurado → libera tudo (degradação graciosa)
    if (!enabled) return true;

    // Token ausente/vazio → reprovado (evita submit sem widget)
    if (!token?.trim()) return false;

    const body = new URLSearchParams({
      secret: this.secret!,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      let res: Response;
      try {
        res = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      const json = (await res.json()) as { success: boolean; [k: string]: unknown };
      return json.success === true;
    } catch (err) {
      // Erro de rede ou timeout da API do Cloudflare → fail-open
      // (não penalizamos o usuário por indisponibilidade do serviço externo)
      this.log.warn(
        `Turnstile: falha de rede ao validar token — fail-open. Erro: ${(err as Error).message}`,
      );
      return true;
    }
  }
}
