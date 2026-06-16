import { listarReceitas } from '../../../lib/transparencia';
import { brl, dataHora } from '../../../lib/format';
import { apiBase } from '../../../lib/auth-shared';

type SP = Record<string, string | undefined>;

function buildQuery(sp: SP, overrides: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of ['ano', 'page'] as const) if (sp[k]) p.set(k, sp[k] as string);
  for (const [k, v] of Object.entries(overrides)) p.set(k, v);
  return p.toString();
}

export const metadata = { title: 'Receitas — Transparência' };

export default async function ReceitasPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const res = await listarReceitas(buildQuery(searchParams, { page: String(page) }));
  const totalPaginas = Math.max(1, Math.ceil(res.total / res.pageSize));
  const exportQs = buildQuery(searchParams);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Receitas
      </nav>
      <h1 className="font-heading text-2xl font-bold">Receitas</h1>
      <p className="text-sm text-fg/70">
        Última atualização: {dataHora(res.ultimaAtualizacao)} · {res.total.toLocaleString('pt-BR')} registros
      </p>

      <p className="text-sm">
        Baixar:{' '}
        <a href={`${apiBase}/api/transparencia/receitas.csv?${exportQs}`} className="underline">CSV</a>
        {' · '}
        <a href={`${apiBase}/api/transparencia/receitas.json?${exportQs}`} className="underline">JSON</a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Lista de receitas do município</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">Ano</th>
              <th scope="col" className="p-2">Código</th>
              <th scope="col" className="p-2">Descrição</th>
              <th scope="col" className="p-2">Categoria</th>
              <th scope="col" className="p-2 text-right">Previsto</th>
              <th scope="col" className="p-2 text-right">Arrecadado</th>
            </tr>
          </thead>
          <tbody>
            {res.data.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-fg/60">Nenhuma receita encontrada.</td></tr>
            )}
            {res.data.map((r) => (
              <tr key={`${r.exercicio}-${r.codigo}-${r.dataLancamento}`} className="border-b border-border/50">
                <td className="p-2">{r.exercicio}</td>
                <td className="p-2">{r.codigo}</td>
                <td className="p-2">{r.descricao ?? '—'}</td>
                <td className="p-2">{r.categoria ?? '—'}</td>
                <td className="p-2 text-right">{brl(r.valorPrevisto)}</td>
                <td className="p-2 text-right">{brl(r.valorArrecadado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginação" className="flex items-center gap-4">
        {page > 1 && (
          <a href={`?${buildQuery(searchParams, { page: String(page - 1) })}`} className="underline">‹ Anterior</a>
        )}
        <span className="text-sm text-fg/70">Página {page} de {totalPaginas}</span>
        {page < totalPaginas && (
          <a href={`?${buildQuery(searchParams, { page: String(page + 1) })}`} className="underline">Próxima ›</a>
        )}
      </nav>
    </section>
  );
}
