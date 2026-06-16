import type { Metadata } from 'next';
import { getLicitacoes, getModalidadesEmUso } from '../../lib/licitacoes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Licitações — Transparência' };

type SP = { modalidade?: string; ano?: string; situacao?: string; q?: string; page?: string };

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

const SITUACOES = ['aberta', 'em andamento', 'homologada', 'deserta', 'fracassada', 'revogada', 'anulada'];

export default async function LicitacoesPage({ searchParams }: { searchParams: SP }) {
  const [data, modalidades] = await Promise.all([getLicitacoes(searchParams), getModalidadesEmUso()]);
  const lista = data ?? { total: 0, page: 1, pageSize: 20, items: [] };
  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.pageSize));

  const qsPagina = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== 'page') sp.set(k, String(v));
    sp.set('page', String(p));
    return `?${sp}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60">
        <a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span> Documentos Oficiais
      </nav>
      <h1 className="font-heading text-3xl font-bold text-fg">Licitações e Processos Licitatórios</h1>
      <p className="mt-1 text-fg/70">Editais, atas, resultados e contratos por processo. Lei 8.666/93 e Lei 14.133/21.</p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="grow">
          <label htmlFor="q" className="block text-sm font-semibold text-fg">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ''} placeholder="Objeto ou número…"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="modalidade" className="block text-sm font-semibold text-fg">Modalidade</label>
          <select id="modalidade" name="modalidade" defaultValue={searchParams.modalidade ?? ''}
            className="mt-1 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Todas</option>
            {(modalidades ?? []).map((m) => <option key={m.slug} value={m.slug}>{m.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="situacao" className="block text-sm font-semibold text-fg">Situação</label>
          <select id="situacao" name="situacao" defaultValue={searchParams.situacao ?? ''}
            className="mt-1 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Todas</option>
            {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ano" className="block text-sm font-semibold text-fg">Ano</label>
          <input id="ano" name="ano" type="number" defaultValue={searchParams.ano ?? ''} placeholder="2026"
            className="mt-1 w-28 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Filtrar</button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/60">{lista.total} processo{lista.total === 1 ? '' : 's'}</p>
        <div className="flex gap-3 text-sm"><a href="/api/licitacoes/export" className="text-primary hover:underline">⬇ Planilha (CSV)</a><a href="/api/licitacoes/export?formato=json" className="text-primary hover:underline">⬇ Dados (JSON)</a></div>
      </div>

      {lista.items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border p-8 text-center text-fg/60">Nenhuma licitação publicada com esses filtros.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {lista.items.map((l) => (
            <li key={l.id} className="rounded-lg border border-border bg-bg p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                {l.modalidade && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{l.modalidade.nome}</span>}
                {l.numero && <span className="text-sm font-semibold text-fg">nº {l.numero}{l.ano ? `/${l.ano}` : ''}</span>}
                {l.situacao && <span className="rounded bg-muted px-2 py-0.5 text-xs text-fg/70 capitalize">{l.situacao}</span>}
              </div>
              <h2 className="mt-1 font-semibold text-fg">
                <a href={`/licitacoes/${l.slug}`} className="hover:text-primary hover:underline">{l.objeto}</a>
              </h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/55">
                {l.criterio && <span>Critério: {l.criterio.nome}</span>}
                {fmtData(l.dataAbertura) && <span>Abertura: {fmtData(l.dataAbertura)}</span>}
                {l.orgao && <span>{l.orgao}</span>}
                <span>{l._count.documentos} documento{l._count.documentos === 1 ? '' : 's'}</span>
              </div>
              <a href={`/licitacoes/${l.slug}`} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">Ver processo e documentos →</a>
            </li>
          ))}
        </ul>
      )}

      {totalPaginas > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginação">
          {lista.page > 1 ? <a href={qsPagina(lista.page - 1)} className="rounded border border-border px-3 py-1.5 hover:bg-muted">Anterior</a> : <span />}
          <span className="text-fg/60">Página {lista.page} de {totalPaginas}</span>
          {lista.page < totalPaginas ? <a href={qsPagina(lista.page + 1)} className="rounded border border-border px-3 py-1.5 hover:bg-muted">Próxima</a> : <span />}
        </nav>
      )}
    </div>
  );
}
