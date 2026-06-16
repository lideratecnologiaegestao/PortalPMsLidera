/**
 * Página pública: Lista de secretarias municipais.
 * Server Component — SSR com revalidação ISR.
 *
 * Acessibilidade: HTML semântico, ancoras por ID, alt em imagens, contraste
 * via tokens de tema (sem cores fixas). WCAG 2.1 AA.
 */

import type { Metadata } from 'next';
import { getSecretarias } from '../../lib/portal-api';
import type { Secretaria } from '../../lib/portal-types';

// Re-exporta revalidate para ISR (Next.js App Router)
export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Secretarias Municipais',
    description:
      'Conheça as secretarias municipais, seus responsáveis, contatos e áreas de atuação.',
    robots: { index: true, follow: true },
  };
}

// ── Componentes de card ───────────────────────────────────────────────────────

function Monograma({ nome }: { nome: string }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg text-xl font-bold"
    >
      {iniciais}
    </div>
  );
}

function SecretariaCard({ sec }: { sec: Secretaria }) {
  return (
    <article
      id={`sec-${sec.id}`}
      aria-labelledby={`sec-${sec.id}-nome`}
      className="flex flex-col gap-4 rounded border border-border bg-bg p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Cabeçalho com foto ou monograma */}
      <div className="flex items-center gap-4">
        {sec.fotoUrl ? (
          <img
            src={sec.fotoUrl}
            alt={`Foto de ${sec.responsavel ?? sec.nome}`}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
            width={64}
            height={64}
          />
        ) : (
          <Monograma nome={sec.nome} />
        )}
        <div className="min-w-0">
          <h2
            id={`sec-${sec.id}-nome`}
            className="font-heading text-base font-bold leading-tight"
          >
            {sec.slug ? (
              <a
                href={`/secretarias/${sec.slug}`}
                className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {sec.nome}
              </a>
            ) : (
              <span className="text-fg">{sec.nome}</span>
            )}
          </h2>
          {sec.sigla && (
            <p className="text-xs font-semibold text-fg/60 uppercase tracking-wide mt-0.5">
              {sec.sigla}
            </p>
          )}
          {sec.responsavel && (
            <p className="text-sm text-fg/70 mt-1">
              <span className="font-semibold">Secretário(a):</span> {sec.responsavel}
            </p>
          )}
        </div>
      </div>

      {/* Descrição */}
      {sec.descricao && (
        <p className="text-sm text-fg/80 leading-relaxed">{sec.descricao}</p>
      )}

      {/* Contato */}
      {(sec.email || sec.telefone) && (
        <address className="not-italic text-sm text-fg/70 space-y-1 border-t border-border pt-3 mt-auto">
          {sec.telefone && (
            <p>
              <span className="font-semibold">Tel:</span>{' '}
              <a
                href={`tel:${sec.telefone}`}
                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {sec.telefone}
              </a>
            </p>
          )}
          {sec.email && (
            <p>
              <span className="font-semibold">E-mail:</span>{' '}
              <a
                href={`mailto:${sec.email}`}
                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {sec.email}
              </a>
            </p>
          )}
        </address>
      )}
    </article>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default async function SecretariasPage() {
  const secretarias = await getSecretarias();

  // Ordena por campo `ordem` (menor primeiro)
  const ordenadas = [...secretarias].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* Cabeçalho da seção */}
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-fg">
          Secretarias Municipais
        </h1>
        <p className="mt-2 text-fg/70">
          Conheça as secretarias, seus responsáveis e áreas de atuação.
        </p>
      </header>

      {ordenadas.length === 0 ? (
        <div
          role="status"
          className="rounded border border-border bg-muted p-10 text-center text-sm text-fg/60"
        >
          Nenhuma secretaria cadastrada no momento.
        </div>
      ) : (
        <ul
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={`${ordenadas.length} secretaria${ordenadas.length !== 1 ? 's' : ''} encontrada${ordenadas.length !== 1 ? 's' : ''}`}
        >
          {ordenadas.map((sec) => (
            <li key={sec.id}>
              <SecretariaCard sec={sec} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
