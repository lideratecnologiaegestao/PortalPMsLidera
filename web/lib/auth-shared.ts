// Helpers de auth seguros para Client Components (NÃO importam next/headers).

/** Base da API para navegação do browser (relativo em produção, atrás do Nginx). */
export const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';

/** URL do login gov.br (o browser navega direto; a API faz o redirect OIDC). */
export function govbrLoginUrl(redirect = '/cidadao'): string {
  return `${apiBase}/api/auth/govbr/login?redirect=${encodeURIComponent(redirect)}`;
}
