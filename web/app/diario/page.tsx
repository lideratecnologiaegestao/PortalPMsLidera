import Link from 'next/link';
import { getArquivo, buscar, getAnos, getTipos, rotuloTipo } from '../../lib/diario';
import { dataCurta } from '../../lib/format';

export const metadata = {
  title: 'Diário Oficial Eletrônico',
  description: 'Edições, atos e busca por palavra ou nome no Diário Oficial do município.',
};

type SP = Record<string, string | undefined>;

const TIPO_EDICAO_LABEL: Record<string, string> = {
  ordinaria: 'Ordinária', extra: 'Extra', suplementar: 'Suplementar',
};

export default async function DiarioPage({ searchParams }: { searchParams: SP }) {
  const q = searchParams.q?.trim() ?? '';
  const tipo = searchParams.tipo?.trim() ?? '';
  const ano = searchParams.ano ? Number(searchParams.ano) : undefined;
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const modoBusca = q.length > 0 || tipo.length > 0;

  const [tipos, anos] = await Promise.all([getTipos(), getAnos()]);
  const busca = modoBusca ? await buscar({ q, tipo, page }) : null;
  const arquivo = modoBusca ? null : await getArquivo({ ano, page });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* Cabeçalho */}
      <header className="rounded-lg border border-border bg-muted/30 p-6">
        <h1 className="font-heading text-3xl font-bold text-fg">Diário Oficial Eletrônico</h1>
        <p className="mt-1 max-w-2xl text-fg/70">
          Publicação oficial dos atos do município, com assinatura digital e verificação de
          autenticidade. Busque por palavra, nome ou número do ato em todas as edições.
        </p>

        {/* Busca full-text */}
        <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, palavra ou número do ato…"
            aria-label="Buscar no Diário Oficial"
            className="flex-1 rounded border border-border bg-bg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select name="tipo" defaultValue={tipo} aria-label="Tipo de ato"
            className="rounded border border-border bg-bg px-3 py-2">
            <option value="">Todos os tipos</option>
            {tipos.map((t) => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
          </select>
          <button className="rounded bg-primary px-5 py-2 font-semibold text-primary-fg hover:opacity-90">
            Buscar
          </button>
        </form>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/60">
          <Link href="/diario/alertas" className="font-semibold text-primary hover:underline">🔔 Receber alertas por termo →</Link>
          <Link href="/diario/verificar" className="text-primary hover:underline">Verificar autenticidade</Link>
          <a href="/api/diario/rss" className="text-primary hover:underline">RSS</a>
          <a href="/api/diario/dados-abertos" className="text-primary hover:underline">Dados abertos (JSON)</a>
        </p>
      </header>

      {/* Resultados da busca */}
      {modoBusca && busca && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl font-bold">Resultados da busca</h2>
            <span className="text-sm text-fg/60">{busca.total} resultado(s)</span>
          </div>

          {busca.items.length === 0 && (
            <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
              Nenhum ato encontrado{q && <> para “{q}”</>}. Tente outras palavras.
            </p>
          )}

          <ul className="space-y-3">
            {busca.items.map((h) => (
              <li key={h.id} className="rounded border border-border bg-bg p-4 hover:border-primary">
                <Link href={`/diario/materia/${h.id}`} className="block">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">{rotuloTipo(h.tipo)}</span>
                    {h.orgao && <span className="text-fg/60">{h.orgao}</span>}
                    <span className="text-fg/50">· Edição nº {h.edicaoNumero} · {dataCurta(h.dataEdicao)}</span>
                  </div>
                  <h3 className="font-semibold text-fg">
                    {h.numeroAto ? `${h.numeroAto} — ` : ''}{h.titulo}
                  </h3>
                  {h.snippet && (
                    <p
                      className="mt-1 text-sm text-fg/70 [&_mark]:bg-warning/40 [&_mark]:text-fg [&_mark]:rounded [&_mark]:px-0.5"
                      dangerouslySetInnerHTML={{ __html: h.snippet }}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <Paginacao base={buildQS({ q, tipo })} page={busca.page} total={busca.total} pageSize={busca.pageSize} />
        </div>
      )}

      {/* Arquivo de edições */}
      {!modoBusca && arquivo && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-xl font-bold">Edições</h2>
            <nav className="flex flex-wrap gap-1" aria-label="Filtrar por ano">
              <Link href="/diario" className={!ano ? chipAtivo : chip}>Todos</Link>
              {anos.map((a) => (
                <Link key={a} href={`/diario?ano=${a}`} className={ano === a ? chipAtivo : chip}>{a}</Link>
              ))}
            </nav>
          </div>

          {arquivo.items.length === 0 && (
            <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
              Nenhuma edição publicada{ano ? ` em ${ano}` : ''} ainda.
            </p>
          )}

          <ul className="divide-y divide-border rounded border border-border">
            {arquivo.items.map((e) => (
              <li key={e.id}>
                <Link href={`/diario/${encodeURIComponent(e.numero)}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40">
                  <div>
                    <p className="font-semibold text-fg">
                      Edição nº {e.numero}
                      {e.tipoEdicao && e.tipoEdicao !== 'ordinaria' && (
                        <span className="ml-2 rounded bg-warning/20 px-2 py-0.5 text-xs font-semibold text-fg">
                          {TIPO_EDICAO_LABEL[e.tipoEdicao] ?? e.tipoEdicao}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-fg/60">{e.titulo}</p>
                  </div>
                  <div className="text-right text-sm text-fg/70">
                    <p>{dataCurta(e.dataEdicao)}</p>
                    <p className="text-xs text-fg/50">{e._count.materias} matéria(s)</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Paginacao base={buildQS({ ano: ano ? String(ano) : '' })} page={arquivo.page} total={arquivo.total} pageSize={arquivo.pageSize} />
        </div>
      )}
    </section>
  );
}

const chip = 'rounded border border-border px-3 py-1 text-sm hover:bg-muted';
const chipAtivo = 'rounded border border-primary bg-primary px-3 py-1 text-sm font-semibold text-primary-fg';

function buildQS(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}&` : '?';
}

function Paginacao({ base, page, total, pageSize }: { base: string; page: number; total: number; pageSize: number }) {
  const totalPaginas = Math.ceil(total / pageSize);
  if (totalPaginas <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Paginação">
      {page > 1 && <Link href={`/diario${base}page=${page - 1}`} className={chip}>← Anterior</Link>}
      <span className="text-sm text-fg/60">Página {page} de {totalPaginas}</span>
      {page < totalPaginas && <Link href={`/diario${base}page=${page + 1}`} className={chip}>Próxima →</Link>}
    </nav>
  );
}
