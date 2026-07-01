/**
 * Página pública: Escola Cidadã — catálogo de cursos.
 * Server Component — SSR com revalidação ISR. WCAG 2.1 AA (semântica,
 * contraste via tokens de tema, alt em imagens).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCursos } from '../../lib/portal-api';
import type { CursoResumo } from '../../lib/portal-types';

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Escola Cidadã',
    description: 'Cursos gratuitos de educação cidadã da Prefeitura Municipal, com certificado.',
    robots: { index: true, follow: true },
  };
}

function CursoCard({ c }: { c: CursoResumo }) {
  return (
    <Link
      href={`/escola/${c.slug}`}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {c.capaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.capaUrl} alt={`Capa do curso ${c.titulo}`} className="h-40 w-full object-cover" />
      ) : (
        <div aria-hidden="true" className="flex h-40 w-full items-center justify-center bg-primary text-primary-fg text-2xl font-bold">
          {c.titulo.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-card-fg">{c.titulo}</h3>
        {c.resumo && <p className="mt-1 line-clamp-3 text-sm text-muted-fg">{c.resumo}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {c.cargaHoraria != null && (
            <span className="rounded bg-muted px-2 py-1 text-muted-fg">{c.cargaHoraria}h</span>
          )}
          {c.certificacao && (
            <span className="rounded bg-muted px-2 py-1 text-muted-fg">Com certificado</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function EscolaPage() {
  const cursos = await getCursos();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-fg">Escola Cidadã</h1>
      <p className="mt-1 text-muted-fg">
        Cursos gratuitos de educação cidadã. Inscreva-se, conclua e receba seu certificado.
      </p>

      <section aria-labelledby="cursos-h" className="mt-8">
        <h2 id="cursos-h" className="sr-only">Cursos disponíveis</h2>
        {cursos.length === 0 ? (
          <p className="mt-4 text-muted-fg">Nenhum curso disponível no momento.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cursos.map((c) => (
              <li key={c.id}>
                <CursoCard c={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm text-muted-fg">
        Tem um certificado para conferir?{' '}
        <Link href="/validar/codigo" className="text-primary underline">Validar certificado</Link>.
      </p>
    </main>
  );
}
