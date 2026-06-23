import { headers } from 'next/headers';
import { getThemeData } from '../../lib/theme';

export const dynamic = 'force-dynamic';

/**
 * Manifest PWA do painel do atendente (/admin).
 * Scope restrito a /admin para não conflitar com o manifest do portal publico.
 * Vary: Host garante isolamento multi-tenant no cache do Nginx/CDN.
 */
function shortName(name: string, max = 14): string {
  const semPrefixo = name
    .replace(
      /^\s*(prefeitura\s+municipal\s+de|prefeitura\s+municipal\s+do|prefeitura\s+de|prefeitura\s+do|munic[íi]pio\s+de|munic[íi]pio\s+do|prefeitura)\s+/i,
      '',
    )
    .trim() || name;
  if (semPrefixo.length <= max) return semPrefixo;
  const truncated = semPrefixo.slice(0, max).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export async function GET(): Promise<Response> {
  const h = headers();
  // Lê o host original para resolucao do tenant (mesmo padrao dos outros routes)
  void (h.get('x-host') ?? h.get('host') ?? '');

  const data = await getThemeData();

  const primaryColor = data.notFound ? '#1351b4' : (data.tokens.colors.primary ?? '#1351b4');
  const bgColor = data.notFound ? '#ffffff' : (data.tokens.colors.bg ?? '#ffffff');
  const portalNome = data.portal.nome ?? 'Prefeitura Municipal';

  const manifest = {
    name: `Atendimento ${portalNome}`,
    short_name: shortName(portalNome),
    description: `Painel do atendente — ${portalNome}`,
    start_url: '/admin',
    scope: '/admin',
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
      'Cache-Control': 'public, max-age=60',
      Vary: 'Host',
    },
  });
}
