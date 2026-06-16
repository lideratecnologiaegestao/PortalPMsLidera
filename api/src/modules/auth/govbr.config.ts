/**
 * Configuração do provedor gov.br (Login Único / OIDC).
 *
 * Os endpoints mudam por ambiente (homologação vs. produção) e por release —
 * sempre confirme no Guia de Integração gov.br vigente. Tudo é parametrizável
 * por env para não acoplar a um ambiente.
 *
 *   Produção:    https://sso.acesso.gov.br
 *   Homologação: https://sso.staging.acesso.gov.br
 */
export interface GovbrConfig {
  providerUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;
  confiabilidadesUrlBase: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export function loadGovbrConfig(): GovbrConfig {
  const providerUrl = (
    process.env.GOVBR_PROVIDER_URL ?? 'https://sso.staging.acesso.gov.br'
  ).replace(/\/$/, '');

  return {
    providerUrl,
    issuer: providerUrl,
    authorizationEndpoint: `${providerUrl}/authorize`,
    tokenEndpoint: `${providerUrl}/token`,
    jwksUri: `${providerUrl}/jwk`,
    userinfoEndpoint: `${providerUrl}/userinfo`,
    // API de confiabilidades (selos bronze/prata/ouro)
    confiabilidadesUrlBase:
      process.env.GOVBR_CONFIABILIDADES_URL ??
      providerUrl.replace('sso.', 'api.'),
    clientId: process.env.GOVBR_CLIENT_ID ?? '',
    clientSecret: process.env.GOVBR_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOVBR_REDIRECT_URI ?? '',
    scopes:
      process.env.GOVBR_SCOPES ??
      'openid email phone profile govbr_confiabilidades',
  };
}

/** Segredo do JWT de sessão (assinado pelo NOSSO backend, não o id_token gov.br). */
export function sessionSecret(): Uint8Array {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'AUTH_JWT_SECRET ausente ou fraco (mínimo 32 chars). Defina no .env.',
    );
  }
  return new TextEncoder().encode(s);
}

/** TTL do token de sessão (ex.: "8h"). */
export const SESSION_TTL = process.env.AUTH_SESSION_TTL ?? '8h';

/** Nomes dos cookies. */
export const COOKIE_SESSION = 'portal_session';
export const COOKIE_TX = 'govbr_tx';
