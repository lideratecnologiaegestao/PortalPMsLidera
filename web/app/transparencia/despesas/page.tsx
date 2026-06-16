import { listarDespesas } from '../../../lib/transparencia';
import { brl, dataCurta, dataHora } from '../../../lib/format';
import { apiBase } from '../../../lib/auth-shared';

type SP = Record<string, string | undefined>;

function buildQuery(sp: SP, overrides: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of ['ano', 'orgao', 'credor', 'page'] as const) {
    if (sp[k]) p.set(k, sp[k] as string);
  }
  for (const [k, v] of Object.entries(overrides)) p.set(k, v);
  return p.toString();
}

export const metadata = { title: 'Despesas — Transparência' };

export default async function DespesasPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const filtros = buildQuery(searchParams, { page: String(page) });
  const res = await listarDespesas(filtros);
  const totalPaginas = Math.max(1, Math.ceil(res.total / res.pageSize));

  // querystring de filtros (sem page) para os links de exportação
  const exportQs = buildQuery(searchParams);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Despesas
      </nav>
      <h1 className="font-heading text-2xl font-bold">Despesas</h1>
      <p className="text-sm text-fg/70">
        Última atualização: {dataHora(res.ultimaAtualizacao)} · {res.total.toLocaleString('pt-BR')} registros
      </p>

      {/* Filtros (GET) */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
        <label className="flex flex-col text-sm">
          Ano
          <input name="ano" defaultValue={searchParams.ano} inputMode="numeric"
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Órgão
          <input name="orgao" defaultValue={searchParams.orgao}
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Credor
          <input name="credor" defaultValue={searchParams.credor}
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-fg">
          Filtrar
        </button>
      </form>

      {/* Dados abertos */}
      <p className="text-sm">
        Baixar:{' '}
        <a href={`${apiBase}/api/transparencia/despesas.csv?${exportQs}`} className="underline">CSV</a>
        {' · '}
        <a href={`${apiBase}/api/transparencia/despesas.json?${exportQs}`} className="underline">JSON</a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Lista de despesas do município</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">Ano</th>
              <th scope="col" className="p-2">Empenho</th>
              <th scope="col" className="p-2">Órgão</th>
              <th scope="col" className="p-2">Credor</th>
              <th scope="col" className="p-2 text-right">Empenhado</th>
              <th scope="col" className="p-2 text-right">Liquidado</th>
              <th scope="col" className="p-2 text-right">Pago</th>
              <th scope="col" className="p-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {res.data.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-fg/60">Nenhuma despesa encontrada.</td></tr>
            )}
            {res.data.map((d) => (
              <tr key={`${d.exercicio}-${d.empenho}`} className="border-b border-border/50">
                <td className="p-2">{d.exercicio}</td>
                <td className="p-2">{d.empenho}</td>
                <td className="p-2">{d.orgao ?? '—'}</td>
                <td className="p-2">{d.credorNome ?? '—'}</td>
                <td className="p-2 text-right">{brl(d.valorEmpenhado)}</td>
                <td className="p-2 text-right">{brl(d.valorLiquidado)}</td>
                <td className="p-2 text-right">{brl(d.valorPago)}</td>
                <td className="p-2">{dataCurta(d.dataEmpenho)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <nav aria-label="Paginação" className="flex items-center gap-4">
        {page > 1 && (
          <a href={`?${buildQuery(searchParams, { page: String(page - 1) })}`} className="underline">
            ‹ Anterior
          </a>
        )}
        <span className="text-sm text-fg/70">Página {page} de {totalPaginas}</span>
        {page < totalPaginas && (
          <a href={`?${buildQuery(searchParams, { page: String(page + 1) })}`} className="underline">
            Próxima ›
          </a>
        )}
      </nav>
    </section>
  );
}
