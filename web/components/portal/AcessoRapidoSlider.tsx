import type { HomeConfig } from '../../lib/portal-types';
import EnqueteWidget from './EnqueteWidget';

function youtubeId(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Painel lateral do Acesso Rápido (modo 2 colunas). */
export default function AcessoRapidoSlider({ config }: { config: HomeConfig }) {
  const wrap = 'h-full min-h-[260px] overflow-hidden rounded-xl border border-border bg-bg shadow-sm';

  switch (config.sliderTipo) {
    case 'imagem':
      if (!config.sliderImagem) return <Vazio />;
      return (
        <div className={wrap}>
          {config.sliderLink ? (
            <a href={config.sliderLink} className="block h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={config.sliderImagem} alt="" className="h-full w-full object-cover" />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.sliderImagem} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      );

    case 'video':
      if (!config.sliderVideo) return <Vazio />;
      return (
        <div className={wrap}>
          <video src={config.sliderVideo} controls className="h-full w-full bg-black object-cover" />
        </div>
      );

    case 'youtube': {
      const id = youtubeId(config.sliderYoutube);
      if (!id) return <Vazio />;
      return (
        <div className={`${wrap} aspect-video`}>
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title="Vídeo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }

    case 'html':
      if (!config.sliderHtml) return <Vazio />;
      return (
        <div className={`${wrap} p-5`}>
          <div className="prose-portal max-w-none" dangerouslySetInnerHTML={{ __html: config.sliderHtml }} />
        </div>
      );

    case 'enquete':
      return <EnqueteWidget enqueteId={config.sliderEnqueteId || 'ativa'} />;

    default:
      return <Vazio />;
  }
}

function Vazio() {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-fg/50">
      Configure o conteúdo do painel em Admin → Layout da Home.
    </div>
  );
}
