import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { GovbrConfig, loadGovbrConfig } from './govbr.config';
import { generatePkce } from './pkce.util';
import { maiorNivel } from './confiabilidade';

export interface GovbrIdentity {
  sub: string;
  nome: string;
  email: string;
  cpf: string | null;
  nivel: number | null;
}

/**
 * Cliente OIDC do gov.br. Responsável APENAS por falar com o gov.br
 * (Authorization Code + PKCE). A emissão da sessão do portal e o upsert do
 * usuário ficam no AuthService. Fronteira de camadas: só o backend toca aqui.
 */
@Injectable()
export class GovbrOidcService {
  private readonly log = new Logger(GovbrOidcService.name);
  private readonly cfg: GovbrConfig = loadGovbrConfig();
  private readonly jwks = createRemoteJWKSet(new URL(this.cfg.jwksUri));

  /** Monta a URL de autorização e devolve os segredos da transação (PKCE/state/nonce). */
  buildAuthorization(redirect: string) {
    const { state, nonce, codeVerifier, codeChallenge } = generatePkce();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      scope: this.cfg.scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return {
      url: `${this.cfg.authorizationEndpoint}?${params.toString()}`,
      tx: { state, nonce, codeVerifier, redirect },
    };
  }

  /** Troca o `code` por tokens no endpoint de token (com o code_verifier do PKCE). */
  async exchangeCode(code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
      code_verifier: codeVerifier,
    });
    // gov.br usa client_secret_basic
    const basic = Buffer.from(
      `${this.cfg.clientId}:${this.cfg.clientSecret}`,
    ).toString('base64');

    const res = await fetch(this.cfg.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // não logar o body bruto (pode conter code/diagnóstico sensível) — só o erro OAuth
      const err = await res.json().catch(() => ({}) as any);
      this.log.error(
        `Falha na troca de code: HTTP ${res.status} — ${err?.error ?? 'desconhecido'}`,
      );
      throw new UnauthorizedException('Falha ao autenticar com o gov.br.');
    }
    return (await res.json()) as {
      access_token: string;
      id_token: string;
      token_type: string;
      expires_in: number;
    };
  }

  /** Valida o id_token (assinatura JWKS, issuer, audience, nonce). */
  async validateIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: this.cfg.issuer,
      audience: this.cfg.clientId,
    });
    if (payload.nonce !== expectedNonce) {
      throw new UnauthorizedException('Nonce inválido no id_token (replay?).');
    }
    return payload;
  }

  /** Lê dados do cidadão (userinfo) e o nível de confiabilidade. */
  async fetchIdentity(
    accessToken: string,
    idPayload: JWTPayload,
  ): Promise<GovbrIdentity> {
    const userinfo = await this.getJson(this.cfg.userinfoEndpoint, accessToken);
    const sub = String(idPayload.sub ?? userinfo.sub);
    const cpf = (userinfo.cpf as string) ?? (sub.length === 11 ? sub : null);
    const nivel = await this.fetchNivel(cpf, accessToken);

    return {
      sub,
      nome: (userinfo.name as string) ?? (userinfo.nome as string) ?? 'Cidadão',
      email:
        (userinfo.email as string) ?? (idPayload.email as string) ?? `${sub}@govbr.local`,
      cpf,
      nivel,
    };
  }

  /** Best-effort: consulta a API de confiabilidades. Falha silenciosa → nível null. */
  private async fetchNivel(
    cpf: string | null,
    accessToken: string,
  ): Promise<number | null> {
    if (!cpf) return null;
    try {
      const url = `${this.cfg.confiabilidadesUrlBase}/confiabilidades/v3/contas/${cpf}/niveis`;
      const data = await this.getJson(url, accessToken);
      return maiorNivel(data);
    } catch (e) {
      this.log.warn(`Não foi possível obter confiabilidade: ${String(e)}`);
      return null;
    }
  }

  private async getJson(url: string, accessToken: string): Promise<any> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  }
}
