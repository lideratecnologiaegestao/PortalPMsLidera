'use client';

/**
 * Bloco CMS: carrossel de imagens acessível.
 *
 * conteudo shape:
 *   slides: { url: string; alt: string; legenda?: string; href?: string }[]
 *   autoplay?: boolean
 *   intervalo?: number  (segundos, padrão 5)
 *
 * Acessibilidade:
 *  - aria-roledescription="carousel" no container
 *  - cada slide: role="group" aria-roledescription="slide" aria-label="X de Y"
 *  - slide inativo: aria-hidden="true"
 *  - setas: aria-label, foco visível
 *  - dots: aria-label + aria-current
 *  - autoplay: pausa em hover/foco e se prefers-reduced-motion
 *  - ESC para pausar autoplay manualmente
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Slide {
  url: string;
  alt: string;
  legenda?: string;
  href?: string;
}

interface SliderProps {
  slides: Slide[];
  autoplay?: boolean;
  intervalo?: number;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export default function SliderBloco({ slides, autoplay = false, intervalo = 5 }: SliderProps) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const total = slides.length;
  const autoplayAtivo = autoplay && !reducedMotion && !pausado && total > 1;

  const irPara = useCallback((idx: number) => {
    setAtual(((idx % total) + total) % total);
  }, [total]);

  const anterior = useCallback(() => irPara(atual - 1), [atual, irPara]);
  const proximo = useCallback(() => irPara(atual + 1), [atual, irPara]);

  // Autoplay
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!autoplayAtivo) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setAtual((prev) => (prev + 1) % total);
    }, Math.max(1000, intervalo * 1000));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoplayAtivo, intervalo, total]);

  // Teclado: setas esquerda/direita dentro do carrossel
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); proximo(); }
    else if (e.key === 'Escape') { setPausado(true); }
  }

  if (total === 0) return null;

  const slide = slides[atual];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Carrossel de imagens"
      className="relative overflow-hidden rounded border border-border"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Slides — wrapper com altura fixa; slides inativos ficam ocultos mas no DOM */}
      <div className="relative h-64 w-full overflow-hidden sm:h-80 md:h-96">
        {slides.map((sl, idx) => {
          const ativo = idx === atual;
          const imgNode = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sl.url}
              alt={sl.alt}
              className="h-full w-full object-cover"
              loading={idx === 0 ? 'eager' : 'lazy'}
            />
          );

          return (
            <div
              key={idx}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${idx + 1} de ${total}`}
              aria-hidden={ativo ? undefined : true}
              className={[
                'absolute inset-0 transition-opacity',
                reducedMotion ? 'duration-0' : 'duration-500',
                ativo ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0',
              ].join(' ')}
            >
              {sl.href ? (
                <a href={sl.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                  {imgNode}
                </a>
              ) : (
                imgNode
              )}
              {sl.legenda && (
                <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-1.5 text-center text-sm text-white">
                  {sl.legenda}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Setas de navegacao */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={anterior}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={proximo}
            aria-label="Proximo slide"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Indicadores (dots) — posicionados sobre o slide */}
      {total > 1 && (
        <div
          className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5"
          role="tablist"
          aria-label="Navegar slides"
        >
          {slides.map((_, idx) => (
            <button
              key={idx}
              role="tab"
              type="button"
              aria-label={`Ir para slide ${idx + 1}`}
              aria-current={idx === atual ? 'true' : undefined}
              onClick={() => irPara(idx)}
              className={[
                'h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                idx === atual ? 'w-5 bg-white' : 'w-2 bg-white/50 hover:bg-white/80',
                reducedMotion ? '!transition-none' : '',
              ].join(' ')}
            />
          ))}
        </div>
      )}

      {/* Contador de posicao (sr-only para leitores) */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {atual + 1} de {total}: {slide?.alt ?? ''}
      </p>
    </section>
  );
}
