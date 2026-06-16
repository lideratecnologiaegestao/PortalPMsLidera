import type { Metadata } from 'next';
import { getConselhos, getTiposEmUso } from '../../lib/conselhos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Conselhos Municipais — Transparência' };

type SP = { tipo?: string; q?: string };

export default async function ConselhosPage({ searchParams }: { searchParams: SP }) {
  const [conselhos, tipos] = await Promise.all([getConselhos(searchParams), getTiposEmUso()]);
  const lista = conselhos ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60">
        <a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span> Documentos Oficiais
      </nav>
      <h1 className="font-heading text-3xl font-bold text-fg">Conselhos Municipais</h1>
      <p className="mt-1 text-fg/70">Composição, mandatos, atas e leis de criação dos conselhos do município.</p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="grow">
          <label htmlFor="q" className="block text-sm font-semibold text-fg">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ''} placeholder="Nome ou sigla…"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="tipo" className="block text-sm font-semibold text-fg">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={searchParams.tipo ?? ''}
            className="mt-1 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Todos</option>
            {(tipos ?? []).map((t) => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Filtrar</button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/60">{lista.length} conselho{lista.length === 1 ? '' : 's'}</p>
        <div className="flex gap-3 text-sm"><a href="/api/conselhos/export" className="text-primary hover:underline">⬇ Planilha (CSV)</a><a href="/api/conselhos/export?formato=json" className="text-primary hover:underline">⬇ Dados (JSON)</a></div>
      </div>

      {lista.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border p-8 text-center text-fg/60">Nenhum conselho publicado com esses filtros.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {lista.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-bg p-4 shadow-sm">
              {c.tipo && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{c.tipo.nome}</span>}
              <h2 className="mt-1 font-semibold text-fg">
                <a href={`/conselhos/${c.slug}`} className="hover:text-primary hover:underline">{c.nome}{c.sigla ? ` (${c.sigla})` : ''}</a>
              </h2>
              {c.descricao && <p className="mt-1 line-clamp-2 text-sm text-fg/70">{c.descricao}</p>}
              <div className="mt-2 flex gap-4 text-xs text-fg/55">
                <span>{c._count.membros} membro{c._count.membros === 1 ? '' : 's'}</span>
                <span>{c._count.documentos} documento{c._count.documentos === 1 ? '' : 's'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
