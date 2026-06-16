import { apiBase } from '../../../lib/auth-shared';
import {
  getAplicResumo,
  getAplicCredores,
  getAplicEmpenhos,
} from '../../../lib/transparencia';

type SP = Record<string, string | undefined>;

export const metadata = { title: 'Execução da despesa — Transparência' };

const r$ = (n: number) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function ExecucaoDespesaPage({ searchParams }: { searchParams: SP }) {
  const exercicio = searchParams.exercicio ? Number(searchParams.exercicio) : undefined;
  const q = searchParams.q?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page ?? 1));

  const [resumo, credores, empenhos] = await Promise.all([
    getAplicResumo(exercicio).catch(() => null),
    getAplicCredores(exercicio).catch(() => null),
    getAplicEmpenhos({ exercicio, q, page }).catch(() => null),
  ]);

  const semDados = !resumo || resumo.empenhos === 0;
  const totalPaginas = empenhos ? Math.max(1, Math.ceil(empenhos.total / empenhos.pageSize)) : 1;
  const exportUrl = (ext: 'csv' | 'json') =>
    `${apiBase}/api/transparencia/despesas/export/empenhos.${ext}${exercicio ? `?exercicio=${exercicio}` : ''}`;
  const linkPagina = (p: number) => {
    const u = new URLSearchParams();
    if (exercicio) u.set('exercicio', String(exercicio));
    if (q) u.set('q', q);
    u.set('page', String(p));
    return `?${u.toString()}`;
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-5">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Execução da despesa
      </nav>
      <h1 className="font-heading text-2xl font-bold">Execução da despesa</h1>
      <p className="text-fg/80">
        Empenhos, liquidações e pagamentos da entidade, a partir da carga contábil
        oficial (APLIC/TCE-MT). Valores em reais; credores pessoa física têm o CPF
        mascarado conforme a LGPD.
      </p>

      {semDados ? (
        <div className="rounded border border-border bg-muted/30 p-6 text-center text-fg/70">
          Ainda não há dados de execução da despesa publicados para esta entidade.
        </div>
      ) : (
        <>
          {/* Resumo */}
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: 'Empenhado', v: resumo!.empenhado, n: resumo!.empenhos },
              { t: 'Liquidado', v: resumo!.liquidado, n: resumo!.liquidacoes },
              { t: 'Pago', v: resumo!.pago, n: resumo!.pagamentos },
            ].map((c) => (
              <div key={c.t} className="rounded border border-border bg-bg p-4">
                <dt className="text-sm font-medium text-fg/60">{c.t}</dt>
                <dd className="mt-1 text-xl font-bold text-primary">{r$(c.v)}</dd>
                <dd className="text-xs text-fg/50">{c.n.toLocaleString('pt-BR')} registros</dd>
              </div>
            ))}
          </dl>

          {/* Filtro + dados abertos */}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
            <label className="flex flex-col text-sm">
              Exercício
              <input name="exercicio" defaultValue={searchParams.exercicio} inputMode="numeric"
                placeholder="ex.: 2026"
                className="rounded border border-border bg-bg px-2 py-1" />
            </label>
            <label className="flex flex-1 flex-col text-sm min-w-[200px]">
              Buscar (credor, objeto ou nº do empenho)
              <input name="q" defaultValue={searchParams.q}
                className="rounded border border-border bg-bg px-2 py-1" />
            </label>
            <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-fg">Filtrar</button>
          </form>
          <p className="text-sm">
            Dados abertos:{' '}
            <a href={exportUrl('csv')} className="underline">CSV</a>{' · '}
            <a href={exportUrl('json')} className="underline">JSON</a>{' · '}
            <a href={`${apiBase}/api/transparencia/despesas/dicionario`} className="underline">dicionário</a>
            {' · '}licença CC BY 4.0
          </p>

          {/* Maiores credores */}
          {credores && credores.credores.length > 0 && (
            <div className="rounded border border-border p-4">
              <h2 className="mb-2 font-heading text-base font-bold">Maiores credores (por empenhado)</h2>
              <ol className="space-y-1 text-sm">
                {credores.credores.map((c, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-border/40 py-1">
                    <span className="truncate">{i + 1}. {c.nome ?? c.credor}{c.nome ? ` (${c.credor})` : ''}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{r$(c.total)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Tabela de empenhos */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Empenhos da execução da despesa</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Empenho</th>
                  <th scope="col" className="p-2">Data</th>
                  <th scope="col" className="p-2">Credor</th>
                  <th scope="col" className="p-2">Objeto</th>
                  <th scope="col" className="p-2 text-right">Empenhado</th>
                  <th scope="col" className="p-2 text-right">Liquidado</th>
                  <th scope="col" className="p-2 text-right">Pago</th>
                </tr>
              </thead>
              <tbody>
                {(!empenhos || empenhos.itens.length === 0) && (
                  <tr><td colSpan={7} className="p-4 text-center text-fg/60">Nenhum empenho encontrado.</td></tr>
                )}
                {empenhos?.itens.map((e, i) => (
                  <tr key={i} className="border-b border-border/50 align-top">
                    <td className="p-2 whitespace-nowrap">{e.empenho}</td>
                    <td className="p-2 whitespace-nowrap">{e.data ?? '—'}</td>
                    <td className="p-2">{e.credorNome ?? e.credor}</td>
                    <td className="p-2 max-w-[28rem]">{e.descricao ?? '—'}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{r$(e.empenhado)}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{r$(e.liquidado)}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{r$(e.pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {empenhos && (
            <nav aria-label="Paginação" className="flex items-center gap-4">
              {page > 1 && <a href={linkPagina(page - 1)} className="underline">‹ Anterior</a>}
              <span className="text-sm text-fg/70">
                Página {page} de {totalPaginas} · {empenhos.total.toLocaleString('pt-BR')} empenhos
              </span>
              {page < totalPaginas && <a href={linkPagina(page + 1)} className="underline">Próxima ›</a>}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
