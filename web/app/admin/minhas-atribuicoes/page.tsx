'use client';

import ManifestacoesAdmin from '../_components/ManifestacoesAdmin';

/**
 * Fila do servidor/área: manifestações encaminhadas a mim pela ouvidoria.
 * Respondo via tramitação interna (a ouvidoria consolida e responde ao cidadão).
 */
export default function MinhasAtribuicoesPage() {
  return <ManifestacoesAdmin minhas />;
}
