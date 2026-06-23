import { headers } from 'next/headers';
import { getThemeData } from '../../lib/theme';

export const dynamic = 'force-dynamic';

/**
 * Rótulo curto para a tela inicial (ícone do PWA). Remove prefixos
 * institucionais ("Município de", "Prefeitura Municipal de"…) para que o
 * nome embaixo do ícone seja o da cidade, e só então trunca em `max` chars.
 */
function shortName(name: string, max = 18): string {
  const semPrefixo = name
    .replace(/^\s*(prefeitura\s+municipal\s+de|prefeitura\s+municipal\s+do|prefeitura\s+de|prefeitura\s+do|munic[íi]pio\s+de|munic[íi]pio\s+do|prefeitura)\s+/i, '')
    .trim() || name;
  if (semPrefixo.length <= max) return semPrefixo;
  const truncated = semPrefixo.slice(0, max).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export async function GET(): Promise<Response> {
  const h = headers();
  const host = h.get('x-host') ?? h.get('host') ?? '';

  const data = await getThemeData();

  // Fallback genérico quando o host não tem prefeitura associada
  const primaryColor = data.notFound ? '#1351b4' : (data.tokens.colors.primary ?? '#1351b4');
  const bgColor = data.notFound ? '#ffffff' : (data.tokens.colors.bg ?? '#ffffff');

  const portalNome = data.portal.nome ?? 'Prefeitura Municipal';
  const portalUf = data.portal.uf;
  const portalDescricao =
    data.portal.descricao?.trim() || 'Portal oficial da Prefeitura';

  const fullName = portalUf ? `${portalNome} - ${portalUf}` : portalNome;

  const manifest = {
    name: fullName,
    short_name: shortName(portalNome),
    description: portalDescricao,
    start_url: '/?utm_source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'pt-BR',
    dir: 'ltr',
    background_color: bgColor,
    theme_color: primaryColor,
    icons: [
      {
        src: '/api/pwa/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa/icon?size=512&maskable=1',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
      // Evita que o Nginx ou CDN sirva o manifest de um tenant para outro
      Vary: 'Host',
    },
  });
}
