/**
 * Página pública COMPLETA de uma secretaria (/secretarias/<slug>).
 * Server Component (SSR/ISR), token-driven, WCAG AA. Seções: secretário, contato,
 * sobre, competências, notícias, galeria (foto/vídeo), trabalhos, documentos.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSecretariaBySlug } from '../../../lib/portal-api';

export const revalidate = 60;

interface NoticiaRef { slug: string; titulo: string; resumo: string | null; imagemUrl: string | null; publicadoEm: string | null }
interface GaleriaItem { id: string; tipo: string; fonte: string; titulo: string | null; url: string | null; youtubeId: string | null }
interface Trabalho { id: string; titulo: string; descricao: string | null; imagemUrl: string | null; data: string | null }
interface DocRef { id: string; titulo: string; numero: string | null; ano: number | null; downloads: number; arquivoUrl: string | null; tipo: { nome: string } | null }
interface Secretaria {
  id: string; nome: string; sigla: string | null; responsavel: string | null; fotoUrl: string | null;
  descricao: string | null; sobre: string | null; competencias: string | null; secretarioBio: string | null;
  secretarioCargo: string | null; endereco: string | null; cep: string | null; horario: string | null;
  email: string | null; telefone: string | null; slug: string;
  noticias: NoticiaRef[]; galeria: GaleriaItem[]; trabalhos: Trabalho[]; documentos: DocRef[];
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const sec = (await getSecretariaBySlug(params.slug)) as Secretaria | null;
  if (!sec) return { title: 'Secretaria não encontrada', robots: { index: false } };
  return { title: sec.nome, description: sec.descricao ?? `Informações da ${sec.nome}.` };
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);
function Iniciais({ nome }: { nome: string }) {
  return <>{nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')}</>;
}
function Secao({ titulo, children, link }: { titulo: string; children: React.ReactNode; link?: { href: string; label: string } }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="font-heading text-xl font-bold text-fg">{titulo}</h2>
        {link && <a href={link.href} className="shrink-0 text-sm font-semibold text-primary hover:underline">{link.label} →</a>}
      </div>
      {children}
    </section>
  );
}

export default async function SecretariaDetalhePage({ params }: { params: { slug: string } }) {
  const sec = (await getSecretariaBySlug(params.slug)) as Secretaria | null;
  if (!sec) notFound();

  const fotos = sec.galeria.filter((g) => g.tipo === 'foto');
  const videos = sec.galeria.filter((g) => g.tipo === 'video');
  // documentos agrupados por tipo
  const tiposDoc: string[] = [];
  const porTipo = new Map<string, DocRef[]>();
  for (const d of sec.documentos) {
    const k = d.tipo?.nome ?? 'Outros';
    if (!porTipo.has(k)) { porTipo.set(k, []); tiposDoc.push(k); }
    porTipo.get(k)!.push(d);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Você está em" className="mb-4 text-sm text-fg/60">
        <a href="/" className="hover:underline">Início</a><span aria-hidden> / </span>
        <a href="/secretarias" className="hover:underline">Secretarias</a><span aria-hidden> / </span>
        <span className="text-fg/80">{sec.nome}</span>
      </nav>

      {/* Cabeçalho */}
      <header>
        <h1 className="font-heading text-3xl font-bold text-fg">{sec.nome}</h1>
        {sec.sigla && <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-fg/55">{sec.sigla}</p>}
      </header>

      {/* Secretário(a) + Contato */}
      <div className="mt-6 grid gap-5 md:grid-cols-[300px_1fr]">
        <div className="rounded-lg border border-border bg-bg p-5 text-center shadow-sm">
          {sec.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sec.fotoUrl} alt={`Foto de ${sec.responsavel ?? sec.nome}`} className="mx-auto h-40 w-40 rounded-full object-cover" />
          ) : (
            <div aria-hidden className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-primary text-5xl font-bold text-primary-fg"><Iniciais nome={sec.nome} /></div>
          )}
          {sec.responsavel && <p className="mt-3 font-heading text-lg font-bold text-fg">{sec.responsavel}</p>}
          <p className="text-sm text-fg/60">{sec.secretarioCargo ?? 'Secretário(a)'}</p>
          {sec.secretarioBio && <div className="prose-portal mx-auto mt-3 max-w-none text-left text-sm text-fg/80" dangerouslySetInnerHTML={{ __html: sec.secretarioBio }} />}
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-5">
          <h2 className="font-heading text-lg font-bold text-fg">Contato e atendimento</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {sec.endereco && <div className="sm:col-span-2"><dt className="text-fg/55">Endereço</dt><dd className="font-medium text-fg">{sec.endereco}{sec.cep ? ` — CEP ${sec.cep}` : ''}</dd></div>}
            {sec.telefone && <div><dt className="text-fg/55">Telefone</dt><dd><a href={`tel:${sec.telefone}`} className="font-medium text-primary hover:underline">{sec.telefone}</a></dd></div>}
            {sec.email && <div><dt className="text-fg/55">E-mail</dt><dd><a href={`mailto:${sec.email}`} className="font-medium text-primary hover:underline">{sec.email}</a></dd></div>}
            {sec.horario && <div className="sm:col-span-2"><dt className="text-fg/55">Horário</dt><dd className="font-medium text-fg">{sec.horario}</dd></div>}
          </dl>
          {sec.descricao && <p className="mt-4 border-t border-border pt-3 text-fg/80">{sec.descricao}</p>}
        </div>
      </div>

      {/* Sobre */}
      {sec.sobre && (
        <Secao titulo="Sobre a secretaria">
          <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: sec.sobre }} />
        </Secao>
      )}

      {/* Competências */}
      {sec.competencias && (
        <Secao titulo="Competências">
          <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: sec.competencias }} />
        </Secao>
      )}

      {/* Notícias da secretaria */}
      {sec.noticias.length > 0 && (
        <Secao titulo="Notícias da secretaria" link={{ href: '/noticias', label: 'Ver mais' }}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sec.noticias.map((n) => (
              <a key={n.slug} href={`/noticias/${n.slug}`} className="group overflow-hidden rounded-lg border border-border bg-bg shadow-sm">
                {n.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.imagemUrl} alt="" className="h-36 w-full object-cover" />
                )}
                <div className="p-3">
                  {fmt(n.publicadoEm) && <p className="text-xs text-fg/50">{fmt(n.publicadoEm)}</p>}
                  <h3 className="mt-1 font-semibold text-fg group-hover:text-primary">{n.titulo}</h3>
                  {n.resumo && <p className="mt-1 line-clamp-2 text-sm text-fg/70">{n.resumo}</p>}
                </div>
              </a>
            ))}
          </div>
        </Secao>
      )}

      {/* Galeria */}
      {(fotos.length > 0 || videos.length > 0) && (
        <Secao titulo="Galeria de fotos e vídeos" link={{ href: '/galeria', label: 'Galeria do site' }}>
          {fotos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {fotos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border">
                  <img src={f.url ?? ''} alt={f.titulo ?? 'Foto'} className="aspect-square w-full object-cover transition hover:scale-105" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {videos.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {videos.map((v) => (
                <figure key={v.id} className="overflow-hidden rounded-lg border border-border bg-black">
                  {v.fonte === 'youtube' && v.youtubeId ? (
                    <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${v.youtubeId}`} title={v.titulo ?? 'Vídeo'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  ) : v.url ? (
                    <video className="aspect-video w-full" src={v.url} controls preload="metadata" />
                  ) : null}
                  {v.titulo && <figcaption className="bg-bg p-2 text-sm text-fg/80">{v.titulo}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </Secao>
      )}

      {/* Trabalhos realizados */}
      {sec.trabalhos.length > 0 && (
        <Secao titulo="Trabalhos realizados">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sec.trabalhos.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-lg border border-border bg-bg shadow-sm">
                {t.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imagemUrl} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="p-3">
                  {fmt(t.data) && <p className="text-xs text-fg/50">{fmt(t.data)}</p>}
                  <h3 className="mt-1 font-semibold text-fg">{t.titulo}</h3>
                  {t.descricao && <p className="mt-1 text-sm text-fg/70">{t.descricao}</p>}
                </div>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Documentos da secretaria */}
      {sec.documentos.length > 0 && (
        <Secao titulo="Documentos da secretaria">
          <div className="space-y-5">
            {tiposDoc.map((tp) => (
              <div key={tp}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg/60">{tp}</h3>
                <ul className="space-y-2">
                  {porTipo.get(tp)!.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{d.numero ? `nº ${d.numero}${d.ano ? `/${d.ano}` : ''} — ` : ''}{d.titulo}</p>
                        <p className="text-xs text-fg/55">⬇ {d.downloads} download{d.downloads === 1 ? '' : 's'}</p>
                      </div>
                      {d.arquivoUrl ? (
                        <a href={`/api/documentos/baixar/${d.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Abrir PDF</a>
                      ) : <span className="shrink-0 text-xs text-fg/40">indisponível</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <div className="mt-10">
        <a href="/secretarias" className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">← Todas as secretarias</a>
      </div>
    </div>
  );
}
