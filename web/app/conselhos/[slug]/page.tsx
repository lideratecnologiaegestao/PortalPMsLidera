import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getConselho } from '../../../lib/conselhos';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getConselho(params.slug).catch(() => null);
  return { title: c ? `${c.nome} — Conselho Municipal` : 'Conselho Municipal' };
}

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

export default async function ConselhoDetalhePage({ params }: { params: { slug: string } }) {
  const c = await getConselho(params.slug);
  if (!c) notFound();

  // documentos agrupados por categoria
  const cats: string[] = [];
  const porCat = new Map<string, typeof c.documentos>();
  for (const d of c.documentos) {
    if (!porCat.has(d.categoria)) { porCat.set(d.categoria, []); cats.push(d.categoria); }
    porCat.get(d.categoria)!.push(d);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60">
        <a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span>
        <a href="/conselhos" className="hover:underline">Conselhos</a> <span aria-hidden> / </span> {c.sigla ?? 'Conselho'}
      </nav>

      {c.tipo && <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">{c.tipo.nome}</span>}
      <h1 className="mt-2 font-heading text-2xl font-bold text-fg">{c.nome}{c.sigla ? ` (${c.sigla})` : ''}</h1>
      {c.descricao && <p className="mt-2 text-fg/75">{c.descricao}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
        {c.leiCriacao && <div><dt className="text-fg/55">Lei de criação</dt><dd className="font-semibold">{c.leiCriacao}</dd></div>}
        {(fmt(c.mandatoInicio) || fmt(c.mandatoFim)) && (
          <div><dt className="text-fg/55">Mandato</dt><dd className="font-semibold">{fmt(c.mandatoInicio) ?? '—'} a {fmt(c.mandatoFim) ?? '—'}</dd></div>
        )}
        {c.email && <div><dt className="text-fg/55">Contato</dt><dd className="font-semibold break-all">{c.email}</dd></div>}
      </dl>

      {/* Membros */}
      <h2 className="mt-8 font-heading text-xl font-bold text-fg">Composição</h2>
      {c.membros.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border p-6 text-center text-fg/60">Composição não informada.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left font-semibold">Membro</th>
                <th className="p-2 text-left font-semibold">Papel</th>
                <th className="p-2 text-left font-semibold">Segmento</th>
                <th className="p-2 text-left font-semibold">Mandato</th>
              </tr>
            </thead>
            <tbody>
              {c.membros.map((m) => (
                <tr key={m.id} className="border-t border-border/60">
                  <td className="p-2 font-medium text-fg">{m.nome}</td>
                  <td className="p-2">{m.papel}</td>
                  <td className="p-2 text-fg/70">{m.segmento ?? '—'}</td>
                  <td className="p-2 text-fg/70">{fmt(m.inicio) ?? '—'}{m.fim ? ` a ${fmt(m.fim)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documentos */}
      <h2 className="mt-8 font-heading text-xl font-bold text-fg">Documentos e atas</h2>
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
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{d.titulo}</p>
                      <p className="text-xs text-fg/55">{fmt(d.dataDocumento) && `${fmt(d.dataDocumento)} · `}⬇ {d.downloads} download{d.downloads === 1 ? '' : 's'}</p>
                    </div>
                    {d.arquivoUrl ? (
                      <a href={`/api/conselhos/baixar/${d.id}`} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Abrir PDF</a>
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
