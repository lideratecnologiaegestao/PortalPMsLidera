import type { Servico } from '../../lib/portal-types';
import SecaoTitulo, { VerTodos } from './SecaoTitulo';

/**
 * Seção "Serviços ao Cidadão" da home — lista os serviços marcados como
 * destaque no /admin/servicos. Oculta se nenhum estiver em destaque.
 */
export default function SecaoServicos({ servicos }: { servicos: Servico[] }) {
  if (!servicos || servicos.length === 0) return null;
  const itens = servicos.slice(0, 8);

  return (
    <section aria-labelledby="servicos-home-titulo" className="bg-bg py-14">
      <div className="mx-auto max-w-7xl px-4">
        <SecaoTitulo id="servicos-home-titulo">Serviços ao Cidadão</SecaoTitulo>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {itens.map((s) => {
            const href = s.urlExterna || `/servicos/${s.slug}`;
            const externo = !!s.urlExterna && /^https?:\/\//.test(s.urlExterna);
            return (
              <a
                key={s.id}
                href={href}
                {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group flex h-full flex-col rounded-xl border border-border bg-bg p-5 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {s.categoria && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{s.categoria}</p>}
                <h3 className="mt-1 font-heading text-base font-bold text-primary">{s.titulo}</h3>
                {s.descricao && <p className="mt-1 line-clamp-2 text-sm text-fg/70">{s.descricao}</p>}
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary group-hover:gap-2 transition-all">
                  Acessar <span aria-hidden="true">➔</span>
                </span>
              </a>
            );
          })}
        </div>

        <VerTodos href="/servicos">Ver todos os serviços →</VerTodos>
      </div>
    </section>
  );
}
