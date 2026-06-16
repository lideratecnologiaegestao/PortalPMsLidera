import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getConvenio } from '../../../lib/convenios';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getConvenio(params.slug).catch(() => null);
  return { title: c ? `${c.objeto} — Convênio` : 'Convênio' };
}
const moeda = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

export default async function ConvenioDetalhePage({ params }: { params: { slug: string } }) {
  const c = await getConvenio(params.slug);
  if (!c) notFound();

  const cats: string[] = [];
  const porCat = new Map<string, typeof c.documentos>();
  for (const d of c.documentos) { if (!porCat.has(d.categoria)) { porCat.set(d.categoria, []); cats.push(d.categoria); } porCat.get(d.categoria)!.push(d); }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60"><a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span><a href="/convenios" className="hover:underline">Convênios</a> <span aria-hidden> / </span> Convênio</nav>
      <div className="flex flex-wrap items-center gap-2">
        {c.numero && <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">Convênio nº {c.numero}{c.ano ? `/${c.ano}` : ''}</span>}
        {c.situacao && <span className="rounded bg-muted px-2 py-0.5 text-sm text-fg/70 capitalize">{c.situacao}</span>}
      </div>
      <h1 className="mt-2 font-heading text-2xl font-bold text-fg">{c.objeto}</h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
        {c.concedente && <div><dt className="text-fg/55">Concedente</dt><dd className="font-semibold">{c.concedente}</dd></div>}
        {c.convenente && <div><dt className="text-fg/55">Convenente</dt><dd className="font-semibold">{c.convenente}</dd></div>}
        {moeda(c.valorRepasse) && <div><dt className="text-fg/55">Valor do repasse</dt><dd className="font-semibold">{moeda(c.valorRepasse)}</dd></div>}
        {moeda(c.contrapartida) && <div><dt className="text-fg/55">Contrapartida</dt><dd className="font-semibold">{moeda(c.contrapartida)}</dd></div>}
        {(fmt(c.vigenciaInicio) || fmt(c.vigenciaFim)) && <div><dt className="text-fg/55">Vigência</dt><dd className="font-semibold">{fmt(c.vigenciaInicio) ?? '—'} a {fmt(c.vigenciaFim) ?? '—'}</dd></div>}
        {c.orgao && <div><dt className="text-fg/55">Órgão</dt><dd className="font-semibold">{c.orgao}</dd></div>}
      </dl>

      <h2 className="mt-8 font-heading text-xl font-bold text-fg">Documentos</h2>
      {c.documentos.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border p-6 text-center text-fg/60">Nenhum documento publicado ainda.</p>
      ) : (
        <div className="mt-3 space-y-5">
          {cats.map((cat) => (
            <section key={cat}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg/60">{cat}</h3>
              <ul className="space-y-2">
                {porCat.get(cat)!.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3">
                    <div className="min-w-0"><p className="font-medium text-fg">{d.titulo}</p><p className="text-xs text-fg/55">{fmt(d.dataDocumento) && `${fmt(d.dataDocumento)} · `}⬇ {d.downloads} download{d.downloads === 1 ? '' : 's'}</p></div>
                    {d.arquivoUrl ? (
                      <a href={`/api/convenios/baixar/${d.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Abrir PDF</a>
                    ) : <span className="shrink-0 text-xs text-fg/40">arquivo indisponível</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
