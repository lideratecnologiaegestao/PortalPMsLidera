/**
 * Seção Secretarias da Home.
 * Server Component. Se API falhar: seção oculta.
 * Tokens: bg-bg, text-fg, border-border, bg-primary, text-primary-fg, bg-muted.
 */

import type { Secretaria } from '../../lib/portal-types';
import SecaoTitulo, { VerTodos } from './SecaoTitulo';

interface Props {
  secretarias: Secretaria[];
}

export default function SecaoSecretarias({ secretarias }: Props) {
  if (secretarias.length === 0) return null;

  const visiveis = secretarias.slice(0, 8);

  return (
    <section aria-labelledby="secretarias-titulo" className="bg-bg py-14">
      <div className="mx-auto max-w-7xl px-4">
        <SecaoTitulo id="secretarias-titulo">Secretarias</SecaoTitulo>

        <ul
          className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4"
          aria-label="Lista de secretarias"
        >
          {visiveis.map((s) => (
            <li key={s.id}>
              <a
                href={s.slug ? `/secretarias/${s.slug}` : '/secretarias'}
                aria-labelledby={`sec-${s.id}`}
                className="group flex h-full flex-col items-center gap-3 rounded-xl border border-border bg-bg p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {s.fotoUrl ? (
                  <img
                    src={s.fotoUrl}
                    alt={s.responsavel ? `Foto de ${s.responsavel}, responsável pela ${s.nome}` : `Secretaria ${s.nome}`}
                    className="h-20 w-20 rounded-full border-2 border-primary/20 object-cover transition-colors group-hover:border-primary"
                    loading="lazy"
                    width={80}
                    height={80}
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg"
                    aria-hidden="true"
                  >
                    {s.sigla ? s.sigla.charAt(0) : s.nome.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 id={`sec-${s.id}`} className="font-heading text-sm font-bold leading-tight text-primary">
                    {s.nome}
                  </h3>
                  {s.responsavel && <p className="mt-1 text-xs text-fg/60">{s.responsavel}</p>}
                </div>
              </a>
            </li>
          ))}
        </ul>

        <VerTodos href="/secretarias">Ver todas as secretarias →</VerTodos>
      </div>
    </section>
  );
}
