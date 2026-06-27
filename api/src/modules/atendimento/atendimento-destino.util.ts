/**
 * Resolve o identificador de destino do cidadão para envio de mensagem,
 * de acordo com o canal da conversa.
 *
 * - whatsapp: destino preferencial é visitanteTelefone; fallback visitanteIdentificador
 * - instagram / messenger: destino é o PSID em visitanteIdentificador; fallback visitanteTelefone
 * - telegram: destino é o chat_id em visitanteIdentificador; fallback visitanteTelefone
 * - demais canais: segue o mesmo padrão dos canais Meta (identificador first)
 *
 * Retorna null quando nenhum identificador estiver disponível — o chamador
 * deve omitir o envio externo (best-effort).
 */
export function destinoCidadao(c: {
  canal: string;
  visitanteTelefone?: string | null;
  visitanteIdentificador?: string | null;
}): string | null {
  if (c.canal === 'whatsapp') {
    return c.visitanteTelefone ?? c.visitanteIdentificador ?? null;
  }
  // instagram, messenger, telegram e quaisquer outros canais externos:
  // o destino primário é o PSID/chat_id gravado em visitanteIdentificador.
  return c.visitanteIdentificador ?? c.visitanteTelefone ?? null;
}
