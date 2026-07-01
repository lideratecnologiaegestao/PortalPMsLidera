/**
 * Deep-links de mapa para o cidadão chegar a uma unidade pública.
 *
 * Regra: quando há coordenadas (lat/lng) usamos o ponto exato — é o que o Waze
 * e o Maps abrem com navegação direta. Sem coordenadas, caímos para a busca
 * textual pelo endereço. Retorna `null` quando não há nem coordenada nem
 * endereço (o chamador esconde os botões).
 */

export interface PontoLocal {
  latitude?: number | null;
  longitude?: number | null;
  endereco?: string | null;
  cep?: string | null;
}

function temCoord(p: PontoLocal): p is PontoLocal & { latitude: number; longitude: number } {
  return typeof p.latitude === 'number' && typeof p.longitude === 'number';
}

/** Texto de busca (endereço + CEP) usado quando não há coordenadas. */
export function enderecoBusca(p: PontoLocal): string | null {
  const partes = [p.endereco?.trim(), p.cep?.trim()].filter(Boolean);
  return partes.length ? partes.join(' — ') : null;
}

/** Link do Google Maps (ponto exato se houver coord; senão busca pelo endereço). */
export function googleMapsLink(p: PontoLocal): string | null {
  if (temCoord(p)) {
    return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
  }
  const q = enderecoBusca(p);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Link do Waze (ponto exato se houver coord; senão busca pelo endereço). */
export function wazeLink(p: PontoLocal): string | null {
  if (temCoord(p)) {
    return `https://waze.com/ul?ll=${p.latitude},${p.longitude}&navigate=yes`;
  }
  const q = enderecoBusca(p);
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : null;
}

/** Há algo para abrir no mapa? (coordenada OU endereço) */
export function temLocalizacao(p: PontoLocal): boolean {
  return temCoord(p) || !!enderecoBusca(p);
}
