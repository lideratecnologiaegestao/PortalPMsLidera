'use client';

/**
 * Seção Hero/Banners. Acessível: sem auto-rotação agressiva, controles
 * play/pause/prev/next por teclado, aria-live para anunciar slides.
 *
 * Se vazio: hero padrão com nome do município e CTAs.
 * Tokens: bg-primary, text-primary-fg, bg-muted, bg-fg, border-border.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Banner } from '../../lib/portal-types';

interface Props {
  banners: Banner[];
  nomeMunicipio: string;
}

export default function HeroBanners({ banners, nomeMunicipio }: Props) {
  const ativos = banners.filter((b) => b.ativo);

  if (ativos.length === 0) {
    return <DefaultHero nomeMunicipio={nomeMunicipio} />;
  }

  if (ativos.length === 1) {
    return <SingleBanner banner={ativos[0]} />;
  }

  return <BannerCarousel banners={ativos} />;
}

// ─── Hero padrão (sem banners) ─────────────────────────────────────────────

function DefaultHero({ nomeMunicipio }: { nomeMunicipio: string }) {
  return (
    <section
      aria-label="Bem-vindo ao portal"
      className="bg-primary text-primary-fg"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20 text-center">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl md:text-5xl mb-4">
          Prefeitura de {nomeMunicipio}
        </h1>
        <p className="text-base sm:text-lg opacity-80 mb-8 max-w-xl mx-auto">
          Serviços, transparência, ouvidoria e informações do município em um só lugar.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="/servicos"
            className="rounded bg-primary-fg px-6 py-3 font-semibold text-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            Ver Serviços
          </a>
          <a
            href="/transparencia"
            className="rounded border-2 border-primary-fg px-6 py-3 font-semibold text-primary-fg hover:bg-primary-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            Transparência
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Imagem do banner (inteira, sem corte, com visual cheio) ───────────────
/**
 * Mostra a imagem COMPLETA (object-contain) — nunca corta topo/base/laterais.
 * Para não deixar "bordas vazias" nas telas em que a proporção não bate, usa a
 * própria imagem borrada e ampliada como fundo, preenchendo o espaço — o banner
 * continua com aparência cheia. Tamanho ideal de upload: ~1920×600 (WebP/JPG).
 */
function BannerImagem({ src, alt }: { src: string; alt: string }) {
  return (
    <>
      {/* Fundo: versão borrada que preenche as laterais (decorativo) */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
      />
      {/* Imagem real, inteira e sem corte, centralizada por cima do fundo */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </>
  );
}

// ─── Banner único ──────────────────────────────────────────────────────────

function SingleBanner({ banner }: { banner: Banner }) {
  return (
    <section aria-label={banner.titulo} className="relative overflow-hidden bg-muted">
      <div className="relative h-64 sm:h-80 md:h-96">
        <BannerImagem src={banner.imagemUrl} alt={banner.titulo} />
        <div className="absolute inset-0 bg-gradient-to-r from-accent/80 to-transparent" />
        <div className="absolute inset-0 flex items-end p-6 sm:p-10">
          <div className="max-w-lg text-primary-fg">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl mb-2">{banner.titulo}</h1>
            {banner.subtitulo && <p className="text-sm sm:text-base opacity-90 mb-4">{banner.subtitulo}</p>}
            {banner.linkUrl && (
              <a
                href={banner.linkUrl}
                className="inline-flex items-center rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
              >
                {banner.ctaLabel ?? 'Saiba mais'}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Carrossel acessível ───────────────────────────────────────────────────

function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false); // não inicia auto-play (WCAG 2.2.2)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = banners.length;

  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + total) % total), [total]);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(next, 6000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, next]);

  const banner = banners[current];

  return (
    <section aria-label="Banners em destaque" className="relative overflow-hidden bg-muted">
      {/* Slide */}
      <div className="relative h-64 sm:h-80 md:h-96" aria-live="polite" aria-atomic="true">
        <BannerImagem src={banner.imagemUrl} alt={banner.titulo} key={banner.id} />
        <div className="absolute inset-0 bg-gradient-to-r from-accent/80 to-transparent" />
        <div className="absolute inset-0 flex items-end p-6 sm:p-10">
          <div className="max-w-lg text-primary-fg">
            <h2 className="font-heading text-xl font-bold sm:text-3xl mb-2">{banner.titulo}</h2>
            {banner.subtitulo && <p className="text-sm opacity-90 mb-4">{banner.subtitulo}</p>}
            {banner.linkUrl && (
              <a
                href={banner.linkUrl}
                className="inline-flex items-center rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
              >
                {banner.ctaLabel ?? 'Saiba mais'}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="absolute bottom-3 right-4 flex items-center gap-2">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? 'Pausar rotação do carrossel' : 'Iniciar rotação automática do carrossel'}
          className="rounded-full bg-bg/80 p-1.5 text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {playing ? (
            <svg aria-hidden="true" width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {/* Prev */}
        <button
          type="button"
          onClick={prev}
          aria-label="Banner anterior"
          className="rounded-full bg-bg/80 p-1.5 text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
          </svg>
        </button>
        {/* Indicadores */}
        {banners.map((b, i) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`Ir para banner ${i + 1}: ${b.titulo}`}
            aria-current={i === current ? 'true' : undefined}
            className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              i === current ? 'w-6 bg-primary' : 'w-2 bg-bg/60'
            }`}
          />
        ))}
        {/* Next */}
        <button
          type="button"
          onClick={next}
          aria-label="Próximo banner"
          className="rounded-full bg-bg/80 p-1.5 text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
