import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCadastroDocumentos, type TipoPublico } from '../../../lib/documentos';

export const dynamic = 'force-dynamic';

type SP = { tipo?: string; ano?: string; q?: string; page?: string };

export async function generateMetadata({ params }: { params: { cadastro: string } }): Promise<Metadata> {
  const data = await getCadastroDocumentos(params.cadastro, {}).catch(() => null);
  return { title: data ? `${data.cadastro.nome} — Documentos` : 'Documentos' };
}

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : null);

// ---------------------------------------------------------------------------
// Arvore de tipos publicos
// O backend retorna parentId como slug do tipo pai (API publica usa slugs).
// A arvore e construida por correspondencia slug <-> parentId.
// ---------------------------------------------------------------------------

interface TipoNoPublico extends TipoPublico {
  filhos: TipoNoPublico[];
}

function buildTreePublico(tipos: TipoPublico[]): TipoNoPublico[] {
  const porSlug = new Map<string, TipoNoPublico>();
  tipos.forEach((t) => porSlug.set(t.slug, { ...t, filhos: [] }));
  const raizes: TipoNoPublico[] = [];
  porSlug.forEach((no) => {
    if (no.parentId && porSlug.has(no.parentId)) {
      porSlug.get(no.parentId)!.filhos.push(no);
    } else {
      raizes.push(no);
    }
  });
  return raizes;
}

function flatTreePublico(
  nos: TipoNoPublico[],
  nivel = 0,
): Array<TipoPublico & { nivel: number }> {
  return nos.flatMap((n) => [{ ...n, nivel }, ...flatTreePublico(n.filhos, nivel + 1)]);
}

// ---------------------------------------------------------------------------
// Opcoes hierarquicas do seletor
// O <select> usa defaultValue no pai; nao usamos `selected` nas <option>.
// ---------------------------------------------------------------------------

function OpcoesHierarquicas({ tipos }: { tipos: TipoPublico[] }) {
  const arvore = buildTreePublico(tipos);
  const flat = flatTreePublico(arvore);

  return (
    <>
      <option value="">Todos</option>
      {flat.map((t) => {
        const recuo = t.nivel > 0 ? ' '.repeat(t.nivel * 4) + '└ ' : '';
        return (
          <option key={t.slug} value={t.slug}>
            {recuo}{t.nome}
          </option>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pagina
// ---------------------------------------------------------------------------

export default async function CadastroDocumentosPage({
  params,
  searchParams,
}: {
  params: { cadastro: string };
  searchParams: SP;
}) {
  const data = await getCadastroDocumentos(params.cadastro, searchParams);
  if (!data) notFound();

  const { cadastro, documentos } = data;
  const totalPaginas = Math.max(1, Math.ceil(documentos.total / documentos.pageSize));
  const pagina = documentos.page;

  const qsPagina = (p: number) => {
    const sp = new URLSearchParams();
    if (searchParams.tipo) sp.set('tipo', searchParams.tipo);
    if (searchParams.ano) sp.set('ano', searchParams.ano);
    if (searchParams.q) sp.set('q', searchParams.q);
    sp.set('page', String(p));
    return `?${sp}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-2 text-sm text-fg/60" aria-label="Navegacao estrutural">
        <a href="/" className="hover:underline">Inicio</a>{' '}
        <span aria-hidden="true">/</span>{' '}
        Documentos Oficiais
      </nav>
      <h1 className="font-heading text-3xl font-bold text-fg">{cadastro.nome}</h1>
      {cadastro.descricao && <p className="mt-1 text-fg/70">{cadastro.descricao}</p>}

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-4"
        aria-label="Filtros de documentos"
      >
        <div className="grow">
          <label htmlFor="q" className="block text-sm font-semibold text-fg">Buscar</label>
          <input
            id="q"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Numero, titulo ou ementa..."
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {cadastro.tipos.length > 0 && (
          <div>
            <label htmlFor="tipo" className="block text-sm font-semibold text-fg">Tipo</label>
            <select
              id="tipo"
              name="tipo"
              defaultValue={searchParams.tipo ?? ''}
              className="mt-1 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <OpcoesHierarquicas tipos={cadastro.tipos} />
            </select>
          </div>
        )}

        <div>
          <label htmlFor="ano" className="block text-sm font-semibold text-fg">Ano</label>
          <input
            id="ano"
            name="ano"
            type="number"
            inputMode="numeric"
            defaultValue={searchParams.ano ?? ''}
            placeholder="2026"
            className="mt-1 w-28 rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/60">
          {documentos.total} documento{documentos.total === 1 ? '' : 's'}
        </p>
        <div className="flex gap-3 text-sm">
          <a href={`/api/documentos/${cadastro.slug}/export`} className="text-primary hover:underline">
            Planilha (CSV)
          </a>
          <a href={`/api/documentos/${cadastro.slug}/export?formato=json`} className="text-primary hover:underline">
            Dados (JSON)
          </a>
        </div>
      </div>

      {documentos.items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border p-8 text-center text-fg/60">
          Nenhum documento publicado com esses filtros.
        </p>
      ) : (
        <ul className="mt-3 space-y-3" aria-label="Lista de documentos">
          {documentos.items.map((d) => (
            <li key={d.id} className="rounded-lg border border-border bg-bg p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {d.tipo && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {d.tipo.nome}
                      </span>
                    )}
                    {d.numero && (
                      <span className="text-sm font-semibold text-fg">
                        n&ordm; {d.numero}{d.ano ? `/${d.ano}` : ''}
                      </span>
                    )}
                    {d.situacao && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-fg/70">
                        {d.situacao}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 font-semibold text-fg">
                    <a
                      href={`/documentos/${params.cadastro}/${d.id}`}
                      className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {d.titulo}
                    </a>
                  </h2>
                  {d.ementa && (
                    <p className="mt-1 line-clamp-2 text-sm text-fg/70">{d.ementa}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/55">
                    {fmtData(d.dataDocumento) && (
                      <span>Publicado em {fmtData(d.dataDocumento)}</span>
                    )}
                    {d.orgao && <span>{d.orgao}</span>}
                    <span aria-label={`${d.downloads} downloads`}>
                      {d.downloads} download{d.downloads === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                {d.arquivoUrl ? (
                  <a
                    href={`/api/documentos/baixar/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90"
                    aria-label={`Abrir PDF de ${d.titulo}`}
                  >
                    Abrir PDF
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-fg/40">arquivo indisponivel</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPaginas > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginacao">
          {pagina > 1 ? (
            <a href={qsPagina(pagina - 1)} className="rounded border border-border px-3 py-1.5 hover:bg-muted">
              Anterior
            </a>
          ) : (
            <span />
          )}
          <span className="text-fg/60">Pagina {pagina} de {totalPaginas}</span>
          {pagina < totalPaginas ? (
            <a href={qsPagina(pagina + 1)} className="rounded border border-border px-3 py-1.5 hover:bg-muted">
              Proxima
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
