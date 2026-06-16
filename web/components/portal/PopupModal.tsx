'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface Popup {
  id: string;
  titulo?: string | null;
  tipo: string; // imagem | video | youtube | html
  imagemUrl?: string | null;
  linkUrl?: string | null;
  youtube?: string | null;
  videoUrl?: string | null;
  conteudoHtml?: string | null;
  mostrarTitulo?: boolean;
  frequenciaHoras: number;
}

function youtubeId(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Popups do portal: busca os ativos para a página atual e exibe o primeiro
 *  ainda não visto (respeita o intervalo `frequenciaHoras` por visitante via
 *  localStorage). Fechável; nunca bloqueia a navegação. */
export default function PopupModal() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<Popup | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin') || pathname.startsWith('/plataforma')) return;
    let cancelado = false;
    fetch(`/api/popups?pagina=${encodeURIComponent(pathname)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Popup[]) => {
        if (cancelado || !Array.isArray(lista)) return;
        const agora = Date.now();
        const escolhido = lista.find((p) => {
          const visto = Number(localStorage.getItem(`popup_${p.id}`) || 0);
          return agora - visto > (p.frequenciaHoras || 0) * 3_600_000;
        });
        if (escolhido) {
          setPopup(escolhido);
          localStorage.setItem(`popup_${escolhido.id}`, String(agora));
        }
      })
      .catch(() => undefined);
    return () => { cancelado = true; };
  }, [pathname]);

  if (!popup) return null;
  const yid = youtubeId(popup.youtube);

  const midia = (
    <>
      {popup.tipo === 'imagem' && popup.imagemUrl && (
        popup.linkUrl ? (
          <a href={popup.linkUrl} onClick={() => setPopup(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={popup.imagemUrl} alt={popup.titulo ?? ''} className="max-h-[70vh] w-full object-contain" />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={popup.imagemUrl} alt={popup.titulo ?? ''} className="max-h-[70vh] w-full object-contain" />
        )
      )}
      {popup.tipo === 'youtube' && yid && (
        <div className="aspect-video w-full">
          <iframe src={`https://www.youtube.com/embed/${yid}`} title={popup.titulo ?? 'Vídeo'} allow="autoplay; encrypted-media" allowFullScreen className="h-full w-full" />
        </div>
      )}
      {popup.tipo === 'video' && popup.videoUrl && (
        <video src={popup.videoUrl} controls autoPlay className="max-h-[70vh] w-full bg-black" />
      )}
      {popup.tipo === 'html' && popup.conteudoHtml && (
        <div className="prose-portal max-w-none p-5" dangerouslySetInnerHTML={{ __html: popup.conteudoHtml }} />
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={popup.titulo ?? 'Aviso'}>
      <div className="relative w-full max-w-xl overflow-hidden rounded-lg border border-border bg-bg shadow-xl">
        <button
          onClick={() => setPopup(null)}
          aria-label="Fechar"
          className="absolute right-2 top-2 z-10 rounded-full bg-bg/80 p-1.5 text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {popup.mostrarTitulo && popup.titulo && (
          <h2 className="border-b border-border px-5 py-3 pr-10 font-heading text-lg font-bold text-primary">{popup.titulo}</h2>
        )}
        {midia}
      </div>
    </div>
  );
}
