import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLicitacao } from '../../../lib/licitacoes';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const l = await getLicitacao(params.slug).catch(() => null);
  return { title: l ? `${l.objeto} — Licitação` : 'Licitação' };
}

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);
const fmtValor = (v: string | null) =>
  v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;

export default async function LicitacaoDetalhePage({ params }: { params: { slug: string } }) {
  const lic = await getLicitacao(params.slug);
  if (!lic) notFound();

  // agrupa documentos por fase preservando a ordem de chegada das fases
  const fases: string[] = [];
  const porFase = new Map<string, typeof lic.documentos>();
  for (const d of lic.documentos) {
    if (!porFase.has(d.fase)) { porFase.set(d.fase, []); fases.push(d.fase); }
    porFase.get(d.fase)!.push(d);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60">
        <a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span>
        <a href="/licitacoes" className="hover:underline">Licitações</a> <span aria-hidden> / </span> Processo
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {lic.modalidade && <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">{lic.modalidade.nome}</span>}
        {lic.situacao && <span className="rounded bg-muted px-2 py-0.5 text-sm text-fg/70 capitalize">{lic.situacao}</span>}
      </div>
      <h1 className="mt-2 font-heading text-2xl font-bold text-fg">{lic.objeto}</h1>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-3">
        {lic.numero && <div><dt className="text-fg/55">Número</dt><dd className="font-semibold">{lic.numero}{lic.ano ? `/${lic.ano}` : ''}</dd></div>}
        {lic.criterio && <div><dt className="text-fg/55">Critério</dt><dd className="font-semibold">{lic.criterio.nome}</dd></div>}
        {lic.orgao && <div><dt className="text-fg/55">Órgão</dt><dd className="font-semibold">{lic.orgao}</dd></div>}
        {fmtData(lic.dataAbertura) && <div><dt className="text-fg/55">Abertura</dt><dd className="font-semibold">{fmtData(lic.dataAbertura)}</dd></div>}
        {fmtValor(lic.valorEstimado) && <div><dt className="text-fg/55">Valor estimado</dt><dd className="font-semibold">{fmtValor(lic.valorEstimado)}</dd></div>}
        {lic.modalidade && (
          <div>
            <dt className="text-fg/55">Base legal</dt>
            <dd className="font-semibold">{[lic.modalidade.lei8666 && 'Lei 8.666/93', lic.modalidade.lei14133 && 'Lei 14.133/21'].filter(Boolean).join(' · ') || '—'}</dd>
          </div>
        )}
      </dl>

      <h2 className="mt-8 font-heading text-xl font-bold text-fg">Documentos do processo</h2>
      {lic.documentos.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border p-6 text-center text-fg/60">Nenhum documento publicado ainda.</p>
      ) : (
        <div className="mt-3 space-y-5">
          {fases.map((fase) => (
            <section key={fase}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg/60">{fase}</h3>
              <ul className="space-y-2">
                {porFase.get(fase)!.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{d.titulo}</p>
                      <p className="text-xs text-fg/55">⬇ {d.downloads} download{d.downloads === 1 ? '' : 's'}</p>
                    </div>
                    {d.arquivoUrl ? (
                      <a href={`/api/licitacoes/baixar/${d.id}`} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">
                        Abrir PDF
                      </a>
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
