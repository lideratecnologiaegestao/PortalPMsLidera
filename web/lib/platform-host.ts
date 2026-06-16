/**
 * Identifica o host de plataforma (super_admin).
 * Definido via NEXT_PUBLIC_PLATFORM_HOST para que seja legível no browser
 * (Client Components precisam saber se estão no host de plataforma).
 */
export const PLATFORM_HOST =
  process.env.NEXT_PUBLIC_PLATFORM_HOST ?? 'prefeitura.lidera.app.br';

/**
 * Retorna true se o host recebido corresponde ao host de plataforma.
 * Ignora a porta para facilitar o desenvolvimento local (ex.: localhost:3000).
 */
export function isPlatformHost(host?: string | null): boolean {
  if (!host) return false;
  return host.split(':')[0] === PLATFORM_HOST.split(':')[0];
}
