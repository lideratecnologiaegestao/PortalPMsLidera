'use client';

/**
 * Barra de utilidades (pré-cabeçalho): ferramentas de acessibilidade,
 * skip links, VLibras, login do cidadão, redes sociais.
 *
 * Client Component: gerencia estado de fonte/contraste via localStorage.
 * Tokens: bg-primary / text-primary-fg (sempre invertido em high-contrast).
 */

import { useEffect, useState, type ReactNode } from 'react';

interface SocialLink {
  href: string;
  label: string;
  icon: ReactNode;
}

const SOCIAL_LINKS: SocialLink[] = [
  {
    href: '#instagram',
    label: 'Instagram da prefeitura',
    icon: (
      <svg aria-hidden="true" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    href: '#facebook',
    label: 'Facebook da prefeitura',
    icon: (
      <svg aria-hidden="true" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    href: '#youtube',
    label: 'YouTube da prefeitura',
    icon: (
      <svg aria-hidden="true" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
      </svg>
    ),
  },
];

export default function UtilityBar() {
  const [contrast, setContrast] = useState(false);
  const [scale, setScale] = useState(100);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedContrast = localStorage.getItem('a11y-contrast') === '1';
    const savedScale = Number(localStorage.getItem('a11y-font') || 100);
    setContrast(savedContrast);
    setScale(savedScale);
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
    <div className="bg-accent text-primary-fg text-xs" role="navigation" aria-label="Ferramentas e atalhos">
      {/* Skip links — visíveis só no foco por teclado */}
      <a href="#conteudo" className="skip-link">Ir para o conteúdo principal [1]</a>
      <a href="#nav-principal" className="skip-link">Ir para o menu [2]</a>
      <a href="#busca" className="skip-link">Ir para a busca [3]</a>
      <a href="#rodape" className="skip-link">Ir para o rodapé [4]</a>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        {/* Links institucionais */}
        <div className="flex items-center gap-3">
          <a href="/mapa-do-site" className="opacity-80 hover:opacity-100 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg">
            Mapa do Site
          </a>
          <a href="/acessibilidade" className="opacity-80 hover:opacity-100 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg">
            Acessibilidade
          </a>
        </div>

        {/* Redes sociais */}
        <div className="flex items-center gap-2" aria-label="Redes sociais">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              aria-label={s.label}
              className="opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg rounded"
            >
              {s.icon}
            </a>
          ))}
        </div>

        {/* Ferramentas de acessibilidade — separadas à direita */}
        <div className="ml-auto flex items-center gap-1" aria-label="Ferramentas de acessibilidade">
          <span className="sr-only">Tamanho da fonte:</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(150, s + 10))}
            aria-label="Aumentar tamanho da fonte"
            title="Aumentar fonte (A+)"
            className="rounded px-2 py-0.5 font-bold hover:bg-primary-fg/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(80, s - 10))}
            aria-label="Diminuir tamanho da fonte"
            title="Diminuir fonte (A-)"
            className="rounded px-2 py-0.5 hover:bg-primary-fg/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => setContrast((v) => !v)}
            aria-pressed={contrast}
            title={contrast ? 'Desativar alto contraste' : 'Ativar alto contraste'}
            className="rounded px-2 py-0.5 hover:bg-primary-fg/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            {contrast ? 'Contraste normal' : 'Alto contraste'}
          </button>
        </div>
      </div>
    </div>
  );
}
