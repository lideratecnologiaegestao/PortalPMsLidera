import { createHmac } from 'node:crypto';

/**
 * Hash determinístico do CPF para deduplicação SEM guardar o dado em claro
 * (parecer DPO). HMAC-SHA-256 com pepper de plataforma (CPF_PEPPER, em env):
 * sem o pepper os hashes não são atacáveis por dicionário. O mesmo CPF gera o
 * mesmo hash em qualquer tenant (dedupe cross-tenant via gov.br).
 */
export function computarCpfHash(cpf?: string | null): string | null {
  if (!cpf) return null;
  const pepper = process.env.CPF_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('CPF_PEPPER ausente ou fraco (>= 32 chars). Defina no .env.');
  }
  const digits = String(cpf).replace(/\D/g, '');
  if (!digits) return null;
  return createHmac('sha256', pepper).update(digits).digest('hex');
}
