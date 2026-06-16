/**
 * Página de busca unificada (ADR-0004).
 *
 * Server Component — sem interatividade direta; filtros e paginação são links
 * que produzem novas navegações SSR. Busca nunca é cacheada (cache: 'no-store').
 *
 * WCAG 2.1 AA:
 *  - role="search" no formulário/área de busca
 *  - aria-live="polite" no cabeçalho de resultados
 *  - foco visível em todos os controles interativos
 *  - contraste via tokens de tema (bg-primary / text-primary-fg etc.)
 *  - HTML semântico (<nav>, <ul>, <article>)
 *
 * Sanitização do snippet: permite apenas <b> e </b>; strip tudo o mais.
 */

import type { Metadata } from 'next';
import PageContainer from '../../components/portal/PageContainer';
import SearchBar from '../../components/portal/SearchBar';
import { getBusca, type BuscaTipo, type BuscaResultado } from '../../lib/portal-api';

// ─── Metadados ────────────────────────────────────────────────────────────────

interface Props {
  searchParams: { q?: string; tipo?: string; page?: string };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = searchParams.q?.trim();
  return {
    title: q ? `Resultados para "${q}" — Portal Municipal` : 'Busca — Portal Municipal',
    robots: { index: false },
  };
}

// ─── Mapeamentos de tipo ───────────────────────────────────────────────────────

const TIPO_ROTULO: Record<BuscaTipo, string> = {
  noticia: 'Notícia',
  documento: 'Documento',
  diario: 'Diário Oficial',
  servico: 'Serviço',
  secretaria: 'Secretaria',
  cms: 'Página',
  transparencia: 'Transparência',
  licitacao: 'Licitação',
  contrato: 'Contrato',
  convenio: 'Convênio',
  conselho: 'Conselho',
  concurso: 'Concurso',
};

/**
 * Cores do badge por tipo — usa apenas tokens do tema (var(--color-*)) mapeados
 * nas classes Tailwind. Nenhuma cor fixa.
 */
const TIPO_BADGE: Record<BuscaTipo, string> = {
  noticia:      'bg-primary/10 text-primary',
  documento:    'bg-accent/10 text-accent',
  diario:       'bg-secondary/10 text-secondary',
  servico:      'bg-success/10 text-success',
  secretaria:   'bg-primary/15 text-primary',
  cms:          'bg-muted text-fg',
  transparencia:'bg-warning/10 text-fg',
  licitacao:    'bg-danger/10 text-danger',
  contrato:     'bg-danger/10 text-danger',
  convenio:     'bg-danger/10 text-danger',
  conselho:     'bg-accent/10 text-accent',
  concurso:     'bg-success/10 text-success',
};

/** Filtros disponíveis na barra de chips. */
const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: '',             rotulo: 'Tudo' },
  { valor: 'noticia',      rotulo: 'Notícias' },
  { valor: 'documento',    rotulo: 'Documentos' },
  { valor: 'diario',       rotulo: 'Diário Oficial' },
  { valor: 'servico',      rotulo: 'Serviços' },
  { valor: 'secretaria',   rotulo: 'Secretarias' },
  { valor: 'cms',          rotulo: 'Páginas' },
  { valor: 'transparencia',rotulo: 'Transparência' },
  { valor: 'licitacao',    rotulo: 'Licitações' },
  { valor: 'contrato',     rotulo: 'Contratos' },
  { valor: 'convenio',     rotulo: 'Convênios' },
  { valor: 'conselho',     rotulo: 'Conselhos' },
  { valor: 'concurso',     rotulo: 'Concursos' },
];

// ─── Sanitização de snippet ───────────────────────────────────────────────────

/**
 * Permite somente <b> e </b> — remove qualquer outra tag HTML.
 * O snippet vem do ts_headline do Postgres e contém apenas <b>…</b> de realce,
 * mas sanitizamos defensivamente antes de `dangerouslySetInnerHTML`.
 */
function sanitizeSnippet(html: string): string {
  // 1. Remove atributos de qualquer tag (ex.: <b class="x"> → <b>)
  // 2. Remove todas as tags exceto <b> e </b> puras
  return html
    .replace(/<([a-zA-Z][^>]*)>/g, (_, tag) => {
      const tagName = tag.split(/\s/)[0].toLowerCase();
      return tagName === 'b' ? '<b>' : '';
    })
    .replace(/<\/([^>]+)>/g, (_, tag) => {
      return tag.trim().toLowerCase() === 'b' ? '</b>' : '';
    });
}

// ─── Utilitários de URL ───────────────────────────────────────────────────────

function buildUrl(q: string, tipo: string, page: number): string {
  const sp = new URLSearchParams({ q });
  if (tipo) sp.set('tipo', tipo);
  if (page > 1) sp.set('page', String(page));
  return `/busca?${sp.toString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function IconeBusca() {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto mb-3 text-fg/30"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
    </svg>
  );
}

interface BadgeProps {
  tipo: BuscaTipo;
}

function Badge({ tipo }: BadgeProps) {
  const rotulo = TIPO_ROTULO[tipo] ?? tipo;
  const cores = TIPO_BADGE[tipo] ?? 'bg-muted text-fg';
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-tight ${cores}`}
    >
      {rotulo}
    </span>
  );
}

interface ResultadoItemProps {
  resultado: BuscaResultado;
}

function ResultadoItem({ resultado }: ResultadoItemProps) {
  const snippetSafe = sanitizeSnippet(resultado.snippet ?? '');
  const data = resultado.publicadoEm ? formatDate(resultado.publicadoEm) : null;

  return (
    <article className="rounded-lg border border-border bg-bg p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tipo={resultado.tipo} />
        {data && (
          <time
            dateTime={resultado.publicadoEm ?? ''}
            className="text-xs text-fg/50"
          >
            {data}
          </time>
        )}
      </div>

      <h2 className="font-heading text-base font-semibold leading-snug text-fg">
        <a
          href={resultado.url}
          className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          {resultado.titulo}
        </a>
      </h2>

      {snippetSafe && (
        <p
          className="mt-2 text-sm text-fg/70 leading-relaxed line-clamp-3 [&_b]:font-semibold [&_b]:text-fg"
          /* eslint-disable-next-line react/no-danger */
          dangerouslySetInnerHTML={{ __html: snippetSafe }}
        />
      )}
    </article>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default async function BuscaPage({ searchParams }: Props) {
  const q = searchParams.q?.trim() ?? '';
  const tipoFiltro = searchParams.tipo ?? '';
  const pageNum = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const PAGE_SIZE = 10;

  const resultado = q
    ? await getBusca(q, {
        tipo: tipoFiltro || undefined,
        page: pageNum,
        pageSize: PAGE_SIZE,
      })
    : null;

  const resultados = resultado?.resultados ?? [];
  const total = resultado?.total ?? 0;
  const totalPages = resultado ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const hasPrev = pageNum > 1;
  const hasNext = pageNum < totalPages;

  return (
    <PageContainer>
      {/* Breadcrumb */}
      <nav aria-label="Localização na página" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-fg/60">
          <li>
            <a
              href="/"
              className="hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Início
            </a>
          </li>
          <li aria-hidden="true">
            <span className="mx-1">/</span>
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Busca
          </li>
        </ol>
      </nav>

      {/* Título */}
      <h1 className="font-heading text-2xl font-bold text-fg mb-4">
        {q ? (
          <>
            Resultados para{' '}
            <span className="text-primary">&ldquo;{q}&rdquo;</span>
          </>
        ) : (
          'Buscar no portal'
        )}
      </h1>

      {/* Barra de busca — role="search" engloba a área funcional de busca */}
      <div role="search" aria-label="Busca no portal" className="mb-6 max-w-2xl">
        <SearchBar />
      </div>

      {/* Filtros por tipo (chips) */}
      {q && (
        <nav
          aria-label="Filtrar resultados por tipo"
          className="mb-6 -mx-1 flex flex-wrap gap-2"
        >
          {FILTROS.map((f) => {
            const ativo = f.valor === tipoFiltro;
            return (
              <a
                key={f.valor}
                href={buildUrl(q, f.valor, 1)}
                aria-current={ativo ? 'page' : undefined}
                aria-pressed={ativo ? 'true' : 'false'}
                className={[
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ativo
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-border bg-bg text-fg hover:bg-muted',
                ].join(' ')}
              >
                {f.rotulo}
              </a>
            );
          })}
        </nav>
      )}

      {/* Cabeçalho de resultados — aria-live para leitores de tela */}
      {q && (
        <p
          aria-live="polite"
          aria-atomic="true"
          className="mb-4 text-sm text-fg/60"
        >
          {total === 0
            ? `Nenhum resultado para "${q}"${tipoFiltro ? ` em ${TIPO_ROTULO[tipoFiltro as BuscaTipo] ?? tipoFiltro}` : ''}.`
            : `${total} ${total === 1 ? 'resultado' : 'resultados'}${tipoFiltro ? ` em ${TIPO_ROTULO[tipoFiltro as BuscaTipo] ?? tipoFiltro}` : ''}${totalPages > 1 ? ` — página ${pageNum} de ${totalPages}` : ''}`}
        </p>
      )}

      {/* Estado: sem termo */}
      {!q && (
        <div
          className="rounded-lg border border-border bg-muted/30 px-6 py-14 text-center"
          role="status"
        >
          <IconeBusca />
          <p className="text-sm text-fg/60">
            Digite um termo acima para buscar notícias, serviços, documentos e
            informações no portal.
          </p>
          <p className="mt-2 text-xs text-fg/40">
            Dica: use palavras-chave específicas para encontrar resultados mais
            relevantes.
          </p>
        </div>
      )}

      {/* Estado: sem resultados */}
      {q && resultados.length === 0 && (
        <div
          className="rounded-lg border border-border bg-muted/30 px-6 py-14 text-center"
          role="status"
        >
          <IconeBusca />
          <p className="text-sm text-fg/60 mb-2">
            Nenhum resultado encontrado para{' '}
            <strong>&ldquo;{q}&rdquo;</strong>
            {tipoFiltro && (
              <>
                {' '}
                em{' '}
                <strong>
                  {TIPO_ROTULO[tipoFiltro as BuscaTipo] ?? tipoFiltro}
                </strong>
              </>
            )}
            .
          </p>
          <p className="text-xs text-fg/40 mb-5">
            Tente termos mais simples, verifique a ortografia ou explore outras
            categorias.
          </p>
          {tipoFiltro && (
            <a
              href={buildUrl(q, '', 1)}
              className="inline-block rounded bg-primary px-5 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Buscar em todos os tipos
            </a>
          )}
          {!tipoFiltro && (
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/noticias"
                className="rounded bg-primary px-5 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ver todas as notícias
              </a>
              <a
                href="/servicos"
                className="rounded border border-border px-5 py-2 text-sm text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ver serviços
              </a>
            </div>
          )}
        </div>
      )}

      {/* Lista de resultados */}
      {q && resultados.length > 0 && (
        <section aria-labelledby="resultados-heading">
          <h2 id="resultados-heading" className="sr-only">
            Lista de resultados
          </h2>

          <ul
            className="flex flex-col gap-4"
            aria-label="Resultados da busca"
          >
            {resultados.map((r) => (
              <li key={`${r.tipo}-${r.refId}`}>
                <ResultadoItem resultado={r} />
              </li>
            ))}
          </ul>

          {/* Paginação */}
          {totalPages > 1 && (
            <nav
              aria-label="Paginação dos resultados"
              className="mt-8 flex items-center justify-between gap-4"
            >
              {hasPrev ? (
                <a
                  href={buildUrl(q, tipoFiltro, pageNum - 1)}
                  className={[
                    'flex items-center gap-2 rounded border border-border px-4 py-2 text-sm',
                    'text-fg hover:bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ].join(' ')}
                  rel="prev"
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Anterior
                </a>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm text-fg/30 cursor-not-allowed select-none"
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Anterior
                </span>
              )}

              <span className="text-sm text-fg/60">
                Página{' '}
                <strong className="text-fg">{pageNum}</strong> de{' '}
                <strong className="text-fg">{totalPages}</strong>
              </span>

              {hasNext ? (
                <a
                  href={buildUrl(q, tipoFiltro, pageNum + 1)}
                  className={[
                    'flex items-center gap-2 rounded border border-border px-4 py-2 text-sm',
                    'text-fg hover:bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  ].join(' ')}
                  rel="next"
                >
                  Próxima
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex items-center gap-2 rounded border border-border px-4 py-2 text-sm text-fg/30 cursor-not-allowed select-none"
                >
                  Próxima
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              )}
            </nav>
          )}
        </section>
      )}
    </PageContainer>
  );
}
