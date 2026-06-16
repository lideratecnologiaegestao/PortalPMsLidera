import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getContrato } from '../../../lib/contratos';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getContrato(params.slug).catch(() => null);
  return { title: c ? `${c.objeto} — Contrato` : 'Contrato' };
}
const moeda = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

export default async function ContratoDetalhePage({ params }: { params: { slug: string } }) {
  const c = await getContrato(params.slug);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60"><a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span><a href="/contratos" className="hover:underline">Contratos</a> <span aria-hidden> / </span> Contrato</nav>
      <div className="flex flex-wrap items-center gap-2">
        {c.numero && <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">Contrato nº {c.numero}{c.ano ? `/${c.ano}` : ''}</span>}
        {c.situacao && <span className="rounded bg-muted px-2 py-0.5 text-sm text-fg/70 capitalize">{c.situacao}</span>}
      </div>
      <h1 className="mt-2 font-heading text-2xl font-bold text-fg">{c.objeto}</h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
        {c.contratado && <div><dt className="text-fg/55">Contratado</dt><dd className="font-semibold">{c.contratado}{c.contratadoDoc ? ` · ${c.contratadoDoc}` : ''}</dd></div>}
        {moeda(c.valor) && <div><dt className="text-fg/55">Valor</dt><dd className="font-semibold">{moeda(c.valor)}</dd></div>}
        {(fmt(c.vigenciaInicio) || fmt(c.vigenciaFim)) && <div><dt className="text-fg/55">Vigência</dt><dd className="font-semibold">{fmt(c.vigenciaInicio) ?? '—'} a {fmt(c.vigenciaFim) ?? '—'}</dd></div>}
        {fmt(c.dataAssinatura) && <div><dt className="text-fg/55">Assinatura</dt><dd className="font-semibold">{fmt(c.dataAssinatura)}</dd></div>}
        {c.orgao && <div><dt className="text-fg/55">Órgão</dt><dd className="font-semibold">{c.orgao}</dd></div>}
        {c.fundamento && <div><dt className="text-fg/55">Fundamento</dt><dd className="font-semibold">{c.fundamento}</dd></div>}
      </dl>

      {c.arquivoUrl && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-bg p-3">
          <div><p className="font-medium text-fg">Íntegra do contrato</p><p className="text-xs text-fg/55">⬇ {c.downloads} download{c.downloads === 1 ? '' : 's'}</p></div>
          <a href={`/api/contratos/baixar/${c.id}`} target="_blank" rel="noopener noreferrer" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Abrir PDF</a>
        </div>
      )}

      <h2 className="mt-8 font-heading text-xl font-bold text-fg">Aditivos</h2>
      {c.aditivos.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border p-6 text-center text-fg/60">Nenhum aditivo registrado.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {c.aditivos.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{a.numero ? `Aditivo nº ${a.numero}` : 'Aditivo'}{a.tipo ? ` — ${a.tipo}` : ''}</p>
                  {a.objeto && <p className="text-sm text-fg/70">{a.objeto}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg/55">
                    {fmt(a.data) && <span>{fmt(a.data)}</span>}
                    {moeda(a.valor) && <span>Valor: {moeda(a.valor)}</span>}
                    {fmt(a.vigenciaFim) && <span>Nova vigência: {fmt(a.vigenciaFim)}</span>}
                    <span>⬇ {a.downloads}</span>
                  </p>
                </div>
                {a.arquivoUrl ? (
                  <a href={`/api/contratos/baixar-aditivo/${a.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Abrir PDF</a>
                ) : <span className="shrink-0 text-xs text-fg/40">sem arquivo</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
