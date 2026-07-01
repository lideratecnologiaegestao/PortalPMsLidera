/**
 * Página pública COMPLETA de uma secretaria (/secretarias/<slug>).
 * Server Component (SSR/ISR), token-driven, WCAG AA. Seções: secretário, contato,
 * sobre, competências, notícias, galeria (foto/vídeo), trabalhos, documentos.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSecretariaBySlug } from '../../../lib/portal-api';
import { googleMapsLink, wazeLink, temLocalizacao, enderecoBusca } from '../../../lib/geo-links';
import { formatarPeriodo, googleCalUrl, outlookCalUrl, icsUrl } from '../../../lib/calendar';
import CopiarTexto from '../../../components/portal/CopiarTexto';

export const revalidate = 60;

interface NoticiaRef { slug: string; titulo: string; resumo: string | null; imagemUrl: string | null; publicadoEm: string | null }
interface GaleriaItem { id: string; tipo: string; fonte: string; titulo: string | null; url: string | null; youtubeId: string | null }
interface Trabalho { id: string; titulo: string; descricao: string | null; imagemUrl: string | null; data: string | null }
interface DocRef { id: string; titulo: string; numero: string | null; ano: number | null; downloads: number; arquivoUrl: string | null; tipo: { nome: string } | null }
interface Unidade {
  id: string; nome: string; sigla: string | null; responsavel: string | null; cargo: string | null;
  telefone: string | null; email: string | null; endereco: string | null; cep: string | null;
  horario: string | null; fotoUrl: string | null; latitude: number | null; longitude: number | null;
}
interface EventoUnidadeRef {
  id: string; nome: string; sigla: string | null; endereco: string | null; cep: string | null;
  horario: string | null; telefone: string | null; fotoUrl: string | null; latitude: number | null; longitude: number | null;
}
interface Evento {
  id: string; titulo: string; descricao: string | null; local: string | null; imagemUrl: string | null;
  inicio: string; fim: string | null; diaInteiro: boolean; timezone: string; unidades: EventoUnidadeRef[];
}
interface Secretaria {
  id: string; nome: string; sigla: string | null; responsavel: string | null; fotoUrl: string | null;
  descricao: string | null; sobre: string | null; competencias: string | null; secretarioBio: string | null;
  secretarioCargo: string | null; endereco: string | null; cep: string | null; horario: string | null;
  email: string | null; telefone: string | null; slug: string;
  noticias: NoticiaRef[]; galeria: GaleriaItem[]; trabalhos: Trabalho[]; documentos: DocRef[]; unidades: Unidade[]; eventos: Evento[];
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

function UnidadeBloco({ u }: { u: Unidade }) {
  const gLink = googleMapsLink(u);
  const wLink = wazeLink(u);
  const copiavel = enderecoBusca(u);
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-bg shadow-sm">
      {u.fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.fotoUrl} alt={`Fachada da unidade ${u.nome}`} className="h-40 w-full object-cover" loading="lazy" />
      )}
      <div className="p-4">
        <h3 className="font-heading text-base font-bold text-fg">{u.nome}{u.sigla ? <span className="font-normal text-fg/50"> ({u.sigla})</span> : null}</h3>
        {u.responsavel && <p className="text-sm text-fg/70">{u.responsavel}{u.cargo ? ` — ${u.cargo}` : ''}</p>}
        <dl className="mt-2 space-y-1 text-sm">
          {u.endereco && <div><dt className="sr-only">Endereço</dt><dd className="text-fg/80">📍 {u.endereco}{u.cep ? ` — CEP ${u.cep}` : ''}</dd></div>}
          {u.horario && <div><dt className="sr-only">Horário</dt><dd className="text-fg/70">🕒 {u.horario}</dd></div>}
          {u.telefone && <div><dt className="sr-only">Telefone</dt><dd><a href={`tel:${u.telefone}`} className="text-primary hover:underline">📞 {u.telefone}</a></dd></div>}
          {u.email && <div><dt className="sr-only">E-mail</dt><dd><a href={`mailto:${u.email}`} className="break-all text-primary hover:underline">✉ {u.email}</a></dd></div>}
        </dl>
        {temLocalizacao(u) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {gLink && <a href={gLink} target="_blank" rel="noreferrer" className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90">Abrir no Google Maps</a>}
            {wLink && <a href={wLink} target="_blank" rel="noreferrer" className="rounded border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Abrir no Waze</a>}
            {copiavel && <CopiarTexto texto={copiavel} rotulo="Copiar endereço" />}
          </div>
        )}
      </div>
    </article>
  );
}

function EventoBloco({ ev }: { ev: Evento }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-bg shadow-sm">
      {ev.imagemUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ev.imagemUrl} alt="" className="h-44 w-full object-cover" loading="lazy" />
      )}
      <div className="p-4">
        <h3 className="font-heading text-lg font-bold text-fg">{ev.titulo}</h3>
        <p className="mt-1 inline-flex items-center gap-1.5 rounded bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">
          🗓️ {formatarPeriodo(ev)}
        </p>
        {ev.descricao && <div className="prose-portal mt-3 max-w-none text-sm text-fg/85" dangerouslySetInnerHTML={{ __html: ev.descricao }} />}

        {ev.unidades.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg/55">Onde</p>
            {ev.unidades.map((u) => {
              const g = googleMapsLink(u); const w = wazeLink(u); const copiavel = enderecoBusca(u);
              return (
                <div key={u.id} className="rounded border border-border bg-muted/20 p-2.5 text-sm">
                  <p className="font-medium text-fg">{u.nome}{u.sigla ? <span className="font-normal text-fg/50"> ({u.sigla})</span> : null}</p>
                  {u.endereco && <p className="text-fg/75">📍 {u.endereco}{u.cep ? ` — CEP ${u.cep}` : ''}</p>}
                  {u.horario && <p className="text-fg/65">🕒 {u.horario}</p>}
                  {temLocalizacao(u) && (
                    <p className="mt-1.5 flex flex-wrap gap-2">
                      {g && <a href={g} target="_blank" rel="noreferrer" className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20">Google Maps ↗</a>}
                      {w && <a href={w} target="_blank" rel="noreferrer" className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20">Waze ↗</a>}
                      {copiavel && <CopiarTexto texto={copiavel} rotulo="Copiar endereço" />}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {ev.unidades.length === 0 && ev.local && <p className="mt-3 text-sm text-fg/75">📍 {ev.local}</p>}

        {/* Adicionar à agenda */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg/55">Adicionar à agenda</p>
          <div className="flex flex-wrap gap-2">
            <a href={googleCalUrl(ev)} target="_blank" rel="noreferrer" className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-muted">Google Agenda</a>
            <a href={outlookCalUrl(ev)} target="_blank" rel="noreferrer" className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-muted">Outlook</a>
            <a href={icsUrl(ev.id)} className="rounded border border-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-muted">Apple / iPhone (.ics)</a>
          </div>
        </div>
      </div>
    </article>
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

      {/* Agenda / Eventos */}
      {sec.eventos.length > 0 && (
        <Secao titulo="Agenda de eventos">
          <div className="grid gap-4 sm:grid-cols-2">
            {sec.eventos.map((ev) => <EventoBloco key={ev.id} ev={ev} />)}
          </div>
        </Secao>
      )}

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

      {/* Unidades / locais de atendimento */}
      {sec.unidades.length > 0 && (
        <Secao titulo="Unidades e locais de atendimento">
          <div className="grid gap-4 sm:grid-cols-2">
            {sec.unidades.map((u) => <UnidadeBloco key={u.id} u={u} />)}
          </div>
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
