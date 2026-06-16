'use client';

import { useEffect, useState } from 'react';

/**
 * Barra de acessibilidade no padrão dos portais gov.br: atalhos de navegação
 * por teclado, alto contraste e ajuste de tamanho de fonte. As preferências
 * persistem em localStorage e são aplicadas no <html>.
 */
export default function AccessibilityBar() {
  const [contrast, setContrast] = useState(false);
  const [scale, setScale] = useState(100);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setContrast(localStorage.getItem('a11y-contrast') === '1');
    setScale(Number(localStorage.getItem('a11y-font') ?? 100));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle('high-contrast', contrast);
    localStorage.setItem('a11y-contrast', contrast ? '1' : '0');
  }, [contrast, ready]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.style.fontSize = `${scale}%`;
    localStorage.setItem('a11y-font', String(scale));
  }, [scale, ready]);

  return (
    <div className="bg-primary text-primary-fg text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1">
        <a href="#conteudo" className="skip-link">
          Ir para o conteúdo [1]
        </a>
        <a href="#rodape" className="skip-link">
          Ir para o rodapé [2]
        </a>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(150, s + 10))}
            aria-label="Aumentar tamanho da fonte"
            className="rounded px-2 py-0.5 underline-offset-2 hover:underline"
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(80, s - 10))}
            aria-label="Diminuir tamanho da fonte"
            className="rounded px-2 py-0.5 underline-offset-2 hover:underline"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => setContrast((v) => !v)}
            aria-pressed={contrast}
            className="rounded px-2 py-0.5 underline-offset-2 hover:underline"
          >
            Alto contraste
          </button>
        </div>
      </div>
    </div>
  );
}
