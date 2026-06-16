import type { Metadata } from 'next';
import { getServicos, getServicosMaisAvaliados } from '../../lib/portal-api';
import type { Servico } from '../../lib/portal-types';
import PageContainer from '../../components/portal/PageContainer';
import SecaoTitulo from '../../components/portal/SecaoTitulo';
import Estrelas from '../../components/portal/Estrelas';

export const revalidate = 120;

// Valores padronizados pelo backend
const PUBLICOS_ALVO = [
  { value: '', label: 'Todos' },
  { value: 'Cidadão', label: 'Cidadão' },
  { value: 'Empresa', label: 'Empresa' },
  { value: 'Servidor', label: 'Servidor' },
] as const;

/** Rótulo curto para o badge no card. */
const PUBLICO_BADGE: Record<string, string> = {
  Cidadão: 'Cidadão',
  Empresa: 'Empresa',
  Servidor: 'Servidor',
};

function media(s: Servico): number {
  return s.avaliacaoQtd ? (s.avaliacaoSoma ?? 0) / s.avaliacaoQtd : 0;
}

export const metadata: Metadata = {
  title: 'Carta de Serviços',
  description: 'Todos os serviços públicos municipais: como solicitar, requisitos, prazos e canais de atendimento.',
};

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: { q?: string; publicoAlvo?: string };
}) {
  const publicoAlvo = searchParams.publicoAlvo ?? '';

  // Busca SSR com filtros passados à API
  const [todos, maisAvaliados] = await Promise.all([
    getServicos({ publicoAlvo: publicoAlvo || undefined, q: searchParams.q || undefined }),
    getServicosMaisAvaliados(),
  ]);

  // A API já filtra por q e publicoAlvo; usamos o resultado diretamente.
  const servicos = todos;

  // Agrupa por categoria preservando a ordem.
  const grupos = new Map<string, Servico[]>();
  for (const s of servicos) {
    const k = s.categoria || 'Outros serviços';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(s);
  }

  /** Monta a URL de um chip de filtro mantendo outros searchParams. */
  function chipHref(pAlvo: string) {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set('q', searchParams.q);
    if (pAlvo) sp.set('publicoAlvo', pAlvo);
    const s = sp.toString();
    return `/servicos${s ? `?${s}` : ''}`;
  }

  return (
    <PageContainer>
      <SecaoTitulo>Carta de Serviços</SecaoTitulo>
      <p className="-mt-4 mb-8 text-center text-fg/70">
        Encontre os serviços públicos do município, com requisitos, prazos e canais de atendimento.
      </p>

      {/* Busca textual */}
      <form method="get" className="mx-auto mb-6 flex max-w-xl gap-2">
        {/* Preserva o filtro de público-alvo ao buscar */}
        {publicoAlvo && (
          <input type="hidden" name="publicoAlvo" value={publicoAlvo} />
        )}
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Buscar serviço (ex.: IPTU, alvará, certidão…)"
          aria-label="Buscar serviço"
          className="flex-1 rounded border border-border bg-bg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          className="rounded bg-primary px-5 py-2 font-semibold text-primary-fg hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      {/* Chips de público-alvo */}
      <nav aria-label="Filtrar por público-alvo" className="mb-10 flex flex-wrap justify-center gap-2">
        {PUBLICOS_ALVO.map(({ value, label }) => {
          const ativo = publicoAlvo === value;
          return (
            <a
              key={value}
              href={chipHref(value)}
              aria-current={ativo ? 'page' : undefined}
              className={[
                'inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                ativo
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-border bg-bg text-fg hover:border-primary hover:text-primary',
              ].join(' ')}
            >
              {label}
            </a>
          );
        })}
      </nav>

      {!searchParams.q && !publicoAlvo && maisAvaliados.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 border-b border-border pb-2 font-heading text-xl font-bold text-fg">
            Serviços mais avaliados
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {maisAvaliados.map((s) => (
              <a
                key={s.id}
                href={`/servicos/${s.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:border-primary"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-heading text-sm font-bold text-primary">{s.titulo}</h3>
                  <Estrelas media={s.media} mostrarNota />
                </div>
                <span className="shrink-0 text-xs text-fg/50">{s.total} aval.</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {servicos.length === 0 && (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          {searchParams.q || publicoAlvo
            ? 'Nenhum serviço encontrado para os filtros selecionados.'
            : 'Nenhum serviço cadastrado ainda.'}
        </p>
      )}

      {[...grupos.entries()].map(([categoria, lista]) => (
        <section key={categoria} className="mb-10">
          <h2 className="mb-4 border-b border-border pb-2 font-heading text-xl font-bold text-fg">
            {categoria}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((s) => (
              <a
                key={s.id}
                href={`/servicos/${s.slug}`}
                className="group flex h-full flex-col rounded-xl border border-border bg-bg p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="font-heading text-base font-bold text-primary">{s.titulo}</h3>
                  {s.publicoAlvo && PUBLICO_BADGE[s.publicoAlvo] && (
                    <span className="shrink-0 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary">
                      {PUBLICO_BADGE[s.publicoAlvo]}
                    </span>
                  )}
                </div>
                {(s.avaliacaoQtd ?? 0) > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-fg/50">
                    <Estrelas media={media(s)} size={14} /> <span>({s.avaliacaoQtd})</span>
                  </div>
                )}
                {s.descricao && (
                  <p className="mt-1 line-clamp-3 text-sm text-fg/70">{s.descricao}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg/60">
                  {s.orgaoResponsavel && <span>🏛️ {s.orgaoResponsavel}</span>}
                  {s.prazoAtendimento && <span>⏱️ {s.prazoAtendimento}</span>}
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary group-hover:gap-2 transition-all">
                  Ver detalhes <span aria-hidden="true">➔</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </PageContainer>
  );
}
