import {
  getMenus,
  getSecretarias,
  getServicos,
  getPaginasPublicadas,
} from '../../lib/portal-api';
import type { MenuItem } from '../../lib/portal-types';
import MapaCliente, { type MapaLink, type MapaSecao } from './MapaCliente';

export const metadata = {
  title: 'Mapa do Site',
  description: 'Todas as páginas e serviços do portal, organizados por área.',
};

export default async function MapaDoSitePage() {
  const [cabecalho, rodape, secretarias, servicos, paginas] = await Promise.all([
    getMenus('cabecalho').catch(() => [] as MenuItem[]),
    getMenus('rodape').catch(() => [] as MenuItem[]),
    getSecretarias().catch(() => []),
    getServicos().catch(() => []),
    getPaginasPublicadas().catch(() => []),
  ]);

  // Agrega tudo num mapa "seção → links" (dedup por href dentro da seção).
  const mapa = new Map<string, MapaLink[]>();
  const avulsos: MapaLink[] = [];
  const add = (secao: string, link: MapaLink) => {
    const arr = mapa.get(secao) ?? [];
    if (!arr.some((l) => l.href === link.href)) arr.push(link);
    mapa.set(secao, arr);
  };

  // Backbone: a navegação que o tenant configurou (cabeçalho + rodapé).
  const processar = (itens: MenuItem[]) => {
    for (const it of itens) {
      const filhos = (it.children ?? []).filter((c) => c.href);
      if (it.tipo === 'grupo' || filhos.length > 0) {
        for (const c of filhos) add(it.label, { label: c.label, href: c.href!, externo: c.tipo === 'externo' });
      } else if (it.href && !avulsos.some((l) => l.href === it.href)) {
        avulsos.push({ label: it.label, href: it.href, externo: it.tipo === 'externo' });
      }
    }
  };
  processar(cabecalho);
  processar(rodape);

  // Coleções dinâmicas (aparecem sozinhas quando o tenant cadastra).
  for (const s of secretarias) if (s.slug) add('Secretarias', { label: s.nome, href: `/secretarias/${s.slug}` });
  for (const sv of servicos) add('Carta de Serviços', { label: sv.titulo, href: `/servicos/${sv.slug}` });
  for (const p of paginas) add('Outras páginas', { label: p.titulo, href: `/${p.slug}` });

  // Ordem: Navegação (itens avulsos do topo) → demais seções.
  const secoes: MapaSecao[] = [];
  if (avulsos.length) secoes.push({ titulo: 'Navegação', links: avulsos });
  for (const [titulo, links] of mapa) if (links.length) secoes.push({ titulo, links });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/" className="underline">Início</a> › Mapa do Site
      </nav>
      <h1 className="font-heading text-2xl font-bold">Mapa do Site</h1>
      <p className="text-fg/70">
        Todas as páginas, serviços e seções deste portal, organizados por área e gerados
        automaticamente a partir do conteúdo publicado. Use a busca para encontrar rapidamente.
      </p>
      {secoes.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg/60">O mapa do site ainda está sendo montado.</p>
      ) : (
        <MapaCliente secoes={secoes} />
      )}
    </section>
  );
}
