import type { Metadata } from 'next';
import { getContratos } from '../../lib/contratos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Contratos — Transparência' };

type SP = { ano?: string; situacao?: string; q?: string };
const SITUACOES = ['vigente', 'encerrado', 'rescindido', 'suspenso'];
const moeda = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

export default async function ContratosPage({ searchParams }: { searchParams: SP }) {
  const lista = (await getContratos(searchParams)) ?? [];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60"><a href="/" className="hover:underline">Início</a> <span aria-hidden> / </span> Documentos Oficiais</nav>
      <h1 className="font-heading text-3xl font-bold text-fg">Contratos e Aditivos</h1>
      <p className="mt-1 text-fg/70">Contratos firmados pelo município, com seus aditivos e valores.</p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="grow">
          <label htmlFor="q" className="block text-sm font-semibold text-fg">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ''} placeholder="Objeto, número ou contratado…" className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label htmlFor="situacao" className="block text-sm font-semibold text-fg">Situação</label>
          <select id="situacao" name="situacao" defaultValue={searchParams.situacao ?? ''} className="mt-1 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Todas</option>{SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ano" className="block text-sm font-semibold text-fg">Ano</label>
          <input id="ano" name="ano" type="number" defaultValue={searchParams.ano ?? ''} placeholder="2026" className="mt-1 w-28 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90">Filtrar</button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/60">{lista.length} contrato{lista.length === 1 ? '' : 's'}</p>
        <div className="flex gap-3 text-sm"><a href="/api/contratos/export" className="text-primary hover:underline">⬇ Planilha (CSV)</a><a href="/api/contratos/export?formato=json" className="text-primary hover:underline">⬇ Dados (JSON)</a></div>
      </div>
      {lista.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border p-8 text-center text-fg/60">Nenhum contrato publicado com esses filtros.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {lista.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-bg p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                {c.numero && <span className="text-sm font-semibold text-fg">Contrato nº {c.numero}{c.ano ? `/${c.ano}` : ''}</span>}
                {c.situacao && <span className="rounded bg-muted px-2 py-0.5 text-xs text-fg/70 capitalize">{c.situacao}</span>}
                {c._count.aditivos > 0 && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{c._count.aditivos} aditivo{c._count.aditivos === 1 ? '' : 's'}</span>}
              </div>
              <h2 className="mt-1 font-semibold text-fg"><a href={`/contratos/${c.slug}`} className="hover:text-primary hover:underline">{c.objeto}</a></h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/55">
                {c.contratado && <span>Contratado: {c.contratado}</span>}
                {moeda(c.valor) && <span>Valor: {moeda(c.valor)}</span>}
                {fmt(c.vigenciaFim) && <span>Vigência até {fmt(c.vigenciaFim)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
