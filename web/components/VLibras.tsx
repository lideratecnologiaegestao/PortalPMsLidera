'use client';

import { useEffect } from 'react';

/**
 * Tradutor de Libras do governo (VLibras). Acessibilidade é lei (CLAUDE.md
 * regra 3): o widget oficial fica disponível em todas as páginas públicas.
 * Carrega o plugin oficial e monta o widget no client.
 */
export default function VLibras() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.async = true;
    script.onload = () => {
      const w = window as unknown as { VLibras?: { Widget: new (url: string) => void } };
      if (w.VLibras) new w.VLibras.Widget('https://vlibras.gov.br/app');
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  // Atributos não-padrão exigidos pelo plugin (spread evita erro de tipos do JSX).
  return (
    <div {...{ vw: 'true' }} className="enabled" aria-label="Tradutor de Libras VLibras">
      <div {...{ 'vw-access-button': 'true' }} className="active" />
      <div {...{ 'vw-plugin-wrapper': 'true' }}>
        <div className="vw-plugin-top-wrapper" />
      </div>
    </div>
  );
}
