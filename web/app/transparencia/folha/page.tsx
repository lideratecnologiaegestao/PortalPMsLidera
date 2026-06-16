import { listarFolha } from '../../../lib/transparencia';
import { brl, dataHora } from '../../../lib/format';
import { apiBase } from '../../../lib/auth-shared';

type SP = Record<string, string | undefined>;

function buildQuery(sp: SP, overrides: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const k of ['ano', 'mes', 'orgao', 'cargo', 'page'] as const) {
    if (sp[k]) p.set(k, sp[k] as string);
  }
  for (const [k, v] of Object.entries(overrides)) p.set(k, v);
  return p.toString();
}

export const metadata = { title: 'Folha de Pagamento — Transparência' };

export default async function FolhaPage({ searchParams }: { searchParams: SP }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const res = await listarFolha(buildQuery(searchParams, { page: String(page) }));
  const totalPaginas = Math.max(1, Math.ceil(res.total / res.pageSize));
  const exportQs = buildQuery(searchParams);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Folha de Pagamento
      </nav>
      <h1 className="font-heading text-2xl font-bold">Folha de Pagamento</h1>
      <p className="text-sm text-fg/70">
        Última atualização: {dataHora(res.ultimaAtualizacao)} · {res.total.toLocaleString('pt-BR')} registros
      </p>
      <p className="rounded border border-border bg-muted/30 p-2 text-xs text-fg/70">
        Publicação conforme STF (ARE 652.777) e LC 131/2009. Em respeito à LGPD, o
        CPF não é divulgado e a matrícula é parcialmente mascarada.
      </p>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
        <label className="flex flex-col text-sm">
          Ano
          <input name="ano" defaultValue={searchParams.ano} inputMode="numeric"
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Mês
          <input name="mes" defaultValue={searchParams.mes} inputMode="numeric"
            className="w-20 rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Órgão
          <input name="orgao" defaultValue={searchParams.orgao}
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          Cargo
          <input name="cargo" defaultValue={searchParams.cargo}
            className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-fg">Filtrar</button>
      </form>

      <p className="text-sm">
        Baixar:{' '}
        <a href={`${apiBase}/api/transparencia/folha.csv?${exportQs}`} className="underline">CSV</a>
        {' · '}
        <a href={`${apiBase}/api/transparencia/folha.json?${exportQs}`} className="underline">JSON</a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Folha de pagamento dos servidores</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">Ano/Mês</th>
              <th scope="col" className="p-2">Matrícula</th>
              <th scope="col" className="p-2">Servidor</th>
              <th scope="col" className="p-2">Cargo</th>
              <th scope="col" className="p-2">Vínculo</th>
              <th scope="col" className="p-2 text-right">Bruto</th>
              <th scope="col" className="p-2 text-right">Descontos</th>
              <th scope="col" className="p-2 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {res.data.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-fg/60">Nenhum registro encontrado.</td></tr>
            )}
            {res.data.map((f, i) => (
              <tr key={`${f.exercicio}-${f.mes}-${f.matriculaMascarada}-${i}`} className="border-b border-border/50">
                <td className="p-2">{f.exercicio}/{String(f.mes).padStart(2, '0')}</td>
                <td className="p-2">{f.matriculaMascarada}</td>
                <td className="p-2">{f.nomeServidor ?? '—'}</td>
                <td className="p-2">{f.cargo ?? '—'}</td>
                <td className="p-2">{f.vinculo ?? '—'}</td>
                <td className="p-2 text-right">{brl(f.remuneracaoBruta)}</td>
                <td className="p-2 text-right">{brl(f.descontos)}</td>
                <td className="p-2 text-right">{brl(f.remuneracaoLiquida)}</td>
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
