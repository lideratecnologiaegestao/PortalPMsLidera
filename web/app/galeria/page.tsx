import type { Metadata } from 'next';
import { getGaleria } from '../../lib/portal-api';
import type { GaleriaItem } from '../../lib/portal-types';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Galeria de Fotos e Vídeos',
  description: 'Registros das ações e eventos do município.',
};

export default async function GaleriaPage() {
  const itens = await getGaleria();
  const fotos = itens.filter((i) => i.tipo === 'foto');
  const videos = itens.filter((i) => i.tipo === 'video');
  const audios = itens.filter((i) => i.tipo === 'audio');

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-fg">Galeria</h1>
        <p className="mt-1 text-fg/70">Fotos, vídeos e áudios das ações e eventos do município.</p>
      </header>

      {audios.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-heading text-xl font-bold text-fg">Áudios</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {audios.map((a) => (
              <figure key={a.id} className="rounded border border-border bg-bg p-3">
                {a.titulo && <figcaption className="mb-2 text-sm font-medium text-fg">{a.titulo}</figcaption>}
                {a.url && <audio src={a.url} controls className="w-full" />}
              </figure>
            ))}
          </div>
        </section>
      )}

      {itens.length === 0 && (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          Ainda não há itens na galeria.
        </p>
      )}

      {videos.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-heading text-xl font-bold text-fg">Vídeos</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <Video key={v.id} item={v} />
            ))}
          </div>
        </section>
      )}

      {fotos.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-bold text-fg">Fotos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((f) => (
              <figure key={f.id} className="overflow-hidden rounded border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url ?? ''}
                  alt={f.titulo ?? 'Foto da galeria'}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                {f.titulo && (
                  <figcaption className="p-2 text-xs text-fg/70">{f.titulo}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Video({ item }: { item: GaleriaItem }) {
  return (
    <figure className="overflow-hidden rounded border border-border bg-muted">
      <div className="aspect-video w-full">
        {item.fonte === 'youtube' && item.youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${item.youtubeId}`}
            title={item.titulo ?? 'Vídeo'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : item.url ? (
          <video src={item.url} controls className="h-full w-full bg-black" />
        ) : null}
      </div>
      {item.titulo && <figcaption className="p-2 text-sm text-fg/80">{item.titulo}</figcaption>}
    </figure>
  );
}
