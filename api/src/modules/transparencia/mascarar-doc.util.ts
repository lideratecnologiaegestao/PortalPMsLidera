/**
 * Mascaramento de documentos para exposição pública (parecer DPO):
 *  - CNPJ (14 dígitos) → público integralmente, formatado.
 *  - CPF (11 dígitos)  → mascarado `***.NNN.NNN-**` (minimização LGPD).
 *  - Nulo/inválido     → null (nunca expõe dado não validado).
 *
 * O valor ORIGINAL permanece intacto no banco; mascara-se só na saída.
 */
export function mascararDocumento(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const d = String(doc).replace(/\D/g, '');
  if (d.length === 11) {
    return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  return null;
}

/** Matrícula de servidor: só os 4 últimos dígitos (`****1234`). */
export function mascararMatricula(matricula: string | null | undefined): string {
  const s = String(matricula ?? '');
  return s.length < 4 ? '****' : `****${s.slice(-4)}`;
}
