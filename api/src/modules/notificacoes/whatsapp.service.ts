/**
 * Re-export de retrocompatibilidade.
 * O WhatsappService foi migrado para api/src/modules/whatsapp/whatsapp.service.ts
 * como parte do adapter multi-provider (Z-API / Evolution / Meta Cloud).
 *
 * Este arquivo mantém o caminho de importação existente válido para callers dentro
 * do módulo notificacoes/ sem exigir alteração imediata em cada arquivo.
 */
export { WhatsappService } from '../whatsapp/whatsapp.service';
