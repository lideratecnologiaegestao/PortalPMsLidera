/**
 * Extrai a URL de embed do YouTube a partir de um link ou ID.
 * Aceita: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
 * youtube.com/shorts/ID, ou o próprio ID (11 chars). Retorna null se inválido.
 */
export function youtubeEmbed(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const s = urlOrId.trim();
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
  const id = m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : '');
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
