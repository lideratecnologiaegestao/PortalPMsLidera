'use client';

/**
 * Banner de campanha — imagem com alt obrigatório e link opcional.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - alt sempre presente (backend exige; aqui há fallback).
 * - Renderizado como Server Component seria preferível, mas os banners
 *   chegam via contexto já carregado no SSR (CampanhaRenderer é client);
 *   este componente é simples e não precisa de hooks.
 */

import type { CampanhaBannerItem } from '../../lib/campanhas';

interface Props {
  banner: CampanhaBannerItem;
}

export default function CampanhaBanner({ banner }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={banner.imagemUrl}
      alt={banner.alt || 'Banner de campanha'}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    />
  );

  if (banner.link) {
    return (
      <a href={banner.link} style={{ display: 'block' }}>
        {img}
      </a>
    );
  }

  return img;
}
