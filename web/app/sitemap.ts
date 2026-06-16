import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getNoticias, getSecretarias, getServicos } from '../lib/portal-api';

/**
 * Sitemap XML automático, gerado por tenant (resolvido pelo Host). Inclui as
 * rotas estáticas + o conteúdo dinâmico publicado (notícias, secretarias,
 * serviços). Dinâmico (usa o host da requisição) — não há cache estático.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = headers().get('host') ?? '';
  const base = `https://${host}`;

  const estaticas = [
    '', '/servicos', '/secretarias', '/institucional/estrutura', '/noticias',
    '/galeria', '/diario', '/ouvidoria', '/esic', '/acompanhar',
    '/transparencia', '/transparencia/despesas', '/transparencia/receitas',
    '/transparencia/folha', '/transparencia/documentos', '/transparencia/dados-abertos',
  ];

  const [noticias, secretarias, servicos] = await Promise.all([
    getNoticias({ pageSize: 200 }).catch(() => ({ items: [] as { slug: string; publicadoEm?: string }[] })),
    getSecretarias().catch(() => []),
    getServicos().catch(() => []),
  ]);

  const urls: MetadataRoute.Sitemap = estaticas.map((p) => ({
    url: base + p,
    changeFrequency: 'weekly',
    priority: p === '' ? 1 : 0.7,
  }));

  for (const n of noticias.items) {
    urls.push({ url: `${base}/noticias/${n.slug}`, lastModified: n.publicadoEm ? new Date(n.publicadoEm) : undefined, changeFrequency: 'monthly', priority: 0.6 });
  }
  for (const s of secretarias) {
    if (s.slug) urls.push({ url: `${base}/secretarias/${s.slug}`, changeFrequency: 'monthly', priority: 0.6 });
  }
  for (const s of servicos) {
    urls.push({ url: `${base}/servicos/${s.slug}`, changeFrequency: 'monthly', priority: 0.6 });
  }

  return urls;
}
