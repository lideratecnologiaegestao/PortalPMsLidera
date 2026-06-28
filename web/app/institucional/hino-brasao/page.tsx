import type { Metadata } from 'next';
import { getHinoBrasao } from '../../../lib/portal-api';
import { youtubeEmbed } from '../../../lib/youtube';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';

export const metadata: Metadata = {
  title: 'Hino e Brasão',
  description: 'O hino e o brasão do município: letra, áudio/vídeo e a história do brasão.',
};

function HinoMidia({ tipo, url }: { tipo: string | null; url: string }) {
  if (tipo === 'youtube') {
    const embed = youtubeEmbed(url);
    if (!embed) return <p className="text-sm text-fg/60">Vídeo indisponível.</p>;
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <iframe className="aspect-video w-full" src={embed} title="Hino do município" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (tipo === 'video') {
    return <video className="w-full rounded-lg border border-border" src={url} controls preload="metadata" />;
  }
  if (tipo === 'audio') {
    return <audio className="w-full" src={url} controls preload="metadata" />;
  }
  return null;
}

export default async function HinoBrasaoPage() {
  const h = await getHinoBrasao();

  const temHino = !!(h?.hinoTexto?.trim() || h?.hinoMidiaUrl?.trim());
  const brasoes = h?.brasoes ?? [];
  const temBrasao = brasoes.length > 0 || !!h?.brasaoHistoria?.trim();

  return (
    <PageContainer>
      <SecaoTitulo>Hino e Brasão</SecaoTitulo>

      {!h || (!temHino && !temBrasao) ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          O hino e o brasão ainda não foram cadastrados.
        </p>
      ) : (
        <>
          {/* Hino */}
          {temHino && (
            <section className="mt-2">
              <h2 className="mb-4 font-heading text-xl font-bold text-fg">Hino do Município</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  {h.hinoTexto?.trim() ? (
                    <p className="whitespace-pre-line leading-relaxed text-fg/85">{h.hinoTexto}</p>
                  ) : (
                    <p className="text-sm text-fg/50">Letra não cadastrada.</p>
                  )}
                </div>
                <div>
                  {h.hinoMidiaUrl?.trim()
                    ? <HinoMidia tipo={h.hinoMidiaTipo} url={h.hinoMidiaUrl} />
                    : <p className="text-sm text-fg/50">Áudio/vídeo não cadastrado.</p>}
                </div>
              </div>
            </section>
          )}

          {/* Brasão */}
          {temBrasao && (
            <section className="mt-12">
              <h2 className="mb-4 font-heading text-xl font-bold text-fg">Brasão do Município</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  {brasoes.length > 0 ? (
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {brasoes.map((b, i) => (
                        <li key={`${b.url}-${i}`} className="text-center">
                          <a href={b.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border bg-bg p-3 hover:border-primary">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.url} alt={b.titulo ?? 'Brasão do município'} className="mx-auto h-32 w-full object-contain" loading="lazy" />
                          </a>
                          {b.titulo && <p className="mt-1 text-xs text-fg/70">{b.titulo}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg/50">Nenhum brasão cadastrado.</p>
                  )}
                </div>
                <div>
                  {h.brasaoHistoria?.trim() ? (
                    <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: h.brasaoHistoria }} />
                  ) : (
                    <p className="text-sm text-fg/50">História do brasão não cadastrada.</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
