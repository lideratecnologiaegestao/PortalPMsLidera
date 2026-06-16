import { authenticator } from 'otplib';

/**
 * TOTP (RFC 6238) para MFA de servidores. Funções puras — testáveis sem rede.
 * O segredo é por usuário (users.mfa_secret); o app autenticador (Google
 * Authenticator/Authy) gera os códigos de 6 dígitos a cada 30s.
 */
export const gerarSecret = (): string => authenticator.generateSecret();

export const otpauthUrl = (conta: string, secret: string): string =>
  authenticator.keyuri(conta, 'Portal Prefeitura', secret);

export const verificarTotp = (secret: string, token: string): boolean => {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
};

/** Gera o código atual (uso em testes). */
export const gerarTotp = (secret: string): string => authenticator.generate(secret);
