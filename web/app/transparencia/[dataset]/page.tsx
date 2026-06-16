import { notFound } from 'next/navigation';
import { listarDataset, LinhaDataset } from '../../../lib/transparencia';
import { brl, dataCurta, dataHora } from '../../../lib/format';
import { apiBase } from '../../../lib/auth-shared';
import {
  conjuntoGenericoPorSlug,
  ColunaDef,
} from '../../../lib/transparencia-conjuntos';

type SP = Record<string, string | undefined>;

export function generateMetadata({ params }: { params: { dataset: string } }) {
  const c = conjuntoGenericoPorSlug(params.dataset);
  return { title: c ? `${c.nome} — Transparência` : 'Transparência' };
}

function fmt(coluna: ColunaDef, valor: LinhaDataset[string]): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (coluna.tipo) {
    case 'moeda':
      return brl(valor as string);
    case 'data':
      return dataCurta(valor as string);
    default:
      return String(valor);
  }
}

export default async function DatasetPage({
  params,
  searchParams,
}: {
  params: { dataset: string };
  searchParams: SP;
}) {
  const conjunto = conjuntoGenericoPorSlug(params.dataset);
  if (!conjunto) notFound();

  const filtroKeys = conjunto.filtros.map((f) => f.key);
  const page = Math.max(1, Number(searchParams.page ?? 1));

  const build = (overrides: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const k of filtroKeys) if (searchParams[k]) p.set(k, searchParams[k] as string);
    for (const [k, v] of Object.entries(overrides)) p.set(k, v);
    return p.toString();
  };

  const res = await listarDataset(conjunto.key, build({ page: String(page) }));
  const totalPaginas = Math.max(1, Math.ceil(res.total / res.pageSize));
  const exportQs = build();
  const exportUrl = (ext: 'csv' | 'json') =>
    `${apiBase}/api/transparencia/dataset/${conjunto.key}/${ext}${exportQs ? `?${exportQs}` : ''}`;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › {conjunto.nome}
      </nav>
      <h1 className="font-heading text-2xl font-bold">{conjunto.nome}</h1>
      <p className="text-fg/80">{conjunto.desc}</p>
      <p className="text-sm text-fg/70">
        Última atualização: {dataHora(res.ultimaAtualizacao)} ·{' '}
        {res.total.toLocaleString('pt-BR')} registros
      </p>

      {/* Filtros (GET) */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
        {conjunto.filtros.map((f) => (
          <label key={f.key} className="flex flex-col text-sm">
            {f.label}
            <input
              name={f.key}
              defaultValue={searchParams[f.key]}
              inputMode={f.key === 'ano' ? 'numeric' : undefined}
              className="rounded border border-border bg-bg px-2 py-1"
            />
          </label>
        ))}
        <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-fg">
          Filtrar
        </button>
      </form>

      {/* Dados abertos */}
      <p className="text-sm">
        Baixar:{' '}
        <a href={exportUrl('csv')} className="underline">CSV</a>
        {' · '}
        <a href={exportUrl('json')} className="underline">JSON</a>
        {' · '}
        <a href="/transparencia/dados-abertos" className="underline">dicionário de dados</a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{conjunto.nome} — {conjunto.desc}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              {conjunto.colunas.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`p-2 ${col.tipo === 'moeda' ? 'text-right' : ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.data.length === 0 && (
              <tr>
                <td colSpan={conjunto.colunas.length} className="p-4 text-center text-fg/60">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {res.data.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                {conjunto.colunas.map((col) => (
                  <td key={col.key} className={`p-2 ${col.tipo === 'moeda' ? 'text-right' : ''}`}>
                    {fmt(col, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <nav aria-label="Paginação" className="flex items-center gap-4">
        {page > 1 && (
          <a href={`?${build({ page: String(page - 1) })}`} className="underline">‹ Anterior</a>
        )}
        <span className="text-sm text-fg/70">Página {page} de {totalPaginas}</span>
        {page < totalPaginas && (
          <a href={`?${build({ page: String(page + 1) })}`} className="underline">Próxima ›</a>
        )}
      </nav>
    </section>
  );
}
