import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

/** robots.txt por tenant: libera o portal público, bloqueia áreas internas. */
export default function robots(): MetadataRoute.Robots {
  const host = headers().get('host') ?? '';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/plataforma', '/api'],
    },
    sitemap: `https://${host}/sitemap.xml`,
  };
}
