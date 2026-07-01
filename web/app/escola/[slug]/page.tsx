/**
 * Página pública: detalhe do curso da Escola Cidadã (descrição, módulos,
 * aulas e carga horária). Server Component — SSR/ISR. WCAG 2.1 AA.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurso } from '../../../lib/portal-api';
import { sanitizeHtml } from '../../../lib/sanitize-html';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCurso(params.slug);
  if (!c) return { title: 'Curso não encontrado' };
  return {
    title: c.titulo,
    description: c.resumo ?? `Curso ${c.titulo} da Escola Cidadã da Prefeitura Municipal.`,
    robots: { index: true, follow: true },
  };
}

export default async function CursoDetalhe({ params }: { params: { slug: string } }) {
  const c = await getCurso(params.slug);
  if (!c) notFound();

  const modulos = Array.isArray(c.modulos) ? c.modulos : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label="Trilha" className="text-sm text-muted-fg">
        <Link href="/escola" className="underline">Escola Cidadã</Link> <span aria-hidden>›</span> {c.titulo}
      </nav>

      <header className="mt-4">
        {c.capaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.capaUrl} alt={`Capa do curso ${c.titulo}`} className="mb-4 h-56 w-full rounded-xl object-cover" />
        )}
        <h1 className="text-2xl font-bold text-fg">{c.titulo}</h1>
        {c.resumo && <p className="mt-1 text-muted-fg">{c.resumo}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {c.cargaHoraria != null && (
            <span className="rounded bg-muted px-2 py-1 text-muted-fg">Carga horária: {c.cargaHoraria}h</span>
          )}
          {c.certificacao && (
            <span className="rounded bg-muted px-2 py-1 text-muted-fg">Emite certificado</span>
          )}
        </div>
      </header>

      {c.descricao && (
        <section aria-labelledby="sobre-h" className="mt-8">
          <h2 id="sobre-h" className="text-xl font-semibold text-fg">Sobre o curso</h2>
          <div
            className="prose mt-3 max-w-none text-fg"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.descricao) }}
          />
        </section>
      )}

      {modulos.length > 0 && (
        <section aria-labelledby="conteudo-h" className="mt-8">
          <h2 id="conteudo-h" className="text-xl font-semibold text-fg">Conteúdo programático</h2>
          <ol className="mt-3 space-y-4">
            {modulos.map((m: any, i: number) => (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-card-fg">
                  {i + 1}. {m.titulo}
                </h3>
                {m.descricao && <p className="mt-1 text-sm text-muted-fg">{m.descricao}</p>}
                {Array.isArray(m.aulas) && m.aulas.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.aulas.map((a: any) => (
                      <li key={a.id} className="flex items-center justify-between text-sm text-fg">
                        <span>{a.titulo}</span>
                        {a.duracaoMin != null && (
                          <span className="text-muted-fg">{a.duracaoMin} min</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="insc-h" className="mt-10 rounded-lg border border-border bg-card p-6">
        <h2 id="insc-h" className="text-lg font-semibold text-card-fg">Quer participar?</h2>
        <p className="mt-1 text-sm text-muted-fg">
          Faça login com sua conta de cidadão para se inscrever e acessar as aulas.
        </p>
        <Link
          href={`/entrar?redirect=/escola/${c.slug}`}
          className="mt-4 inline-block rounded bg-primary px-4 py-2 font-medium text-primary-fg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Inscrever-se no curso
        </Link>
      </section>
    </main>
  );
}
