import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServicoBySlug } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import AvaliacaoServico from '../../../components/portal/AvaliacaoServico';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const s = await getServicoBySlug(params.slug);
  if (!s) return { title: 'Serviço' };
  return { title: `${s.titulo} — Serviços`, description: s.descricao ?? undefined };
}

function etapasLista(etapas: unknown): { titulo: string; descricao?: string }[] {
  if (!Array.isArray(etapas)) return [];
  return etapas.map((e) =>
    typeof e === 'string'
      ? { titulo: e }
      : { titulo: (e?.titulo as string) ?? '', descricao: (e?.descricao as string) ?? undefined },
  ).filter((e) => e.titulo);
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-fg/50">{rotulo}</dt>
      <dd className="mt-1 text-sm text-fg/90">{valor}</dd>
    </div>
  );
}

export default async function ServicoPage({ params }: { params: { slug: string } }) {
  const s = await getServicoBySlug(params.slug);
  if (!s) notFound();
  const etapas = etapasLista(s.etapas);

  return (
    <PageContainer largura="estreito">
      <nav className="text-sm text-fg/60">
        <Link href="/servicos" className="text-primary hover:underline">Serviços</Link>
        <span> / {s.titulo}</span>
      </nav>

      <header className="mt-3 border-b border-border pb-4">
        {s.categoria && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{s.categoria}</p>}
        <h1 className="font-heading text-3xl font-bold text-fg">{s.titulo}</h1>
        {s.descricao && <p className="mt-2 text-fg/80">{s.descricao}</p>}
      </header>

      {/* Informações principais */}
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Órgão responsável" valor={s.orgaoResponsavel} />
        <Campo rotulo="Público-alvo" valor={s.publicoAlvo} />
        <Campo rotulo="Prazo de atendimento" valor={s.prazoAtendimento} />
        <Campo rotulo="Custo" valor={s.custo} />
        <Campo rotulo="Canais de atendimento" valor={s.canaisAtendimento} />
      </dl>

      {s.requisitos && (
        <section className="mt-8">
          <h2 className="mb-2 font-heading text-lg font-bold text-fg">Requisitos / Documentos</h2>
          <div className="prose-portal max-w-none whitespace-pre-line text-sm text-fg/90">{s.requisitos}</div>
        </section>
      )}

      {etapas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-heading text-lg font-bold text-fg">Como solicitar — passo a passo</h2>
          <ol className="space-y-3">
            {etapas.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg">{i + 1}</span>
                <div>
                  <p className="font-semibold text-fg">{e.titulo}</p>
                  {e.descricao && <p className="text-sm text-fg/70">{e.descricao}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.urlExterna && (
        <div className="mt-8">
          <a
            href={s.urlExterna}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded bg-primary px-6 py-3 font-semibold text-primary-fg hover:opacity-90"
          >
            Acessar o serviço online ↗
          </a>
        </div>
      )}

      <AvaliacaoServico slug={s.slug} />
    </PageContainer>
  );
}
