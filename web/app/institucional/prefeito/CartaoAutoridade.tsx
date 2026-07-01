import type { Prefeito } from '../../../lib/portal-api';
import { mandatoTexto, cargoLabel } from './mandato';

function Iniciais({ nome }: { nome: string }) {
  const i = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return <span aria-hidden="true">{i}</span>;
}

/** Cartão de uma autoridade do Executivo (prefeito, vice ou primeira-dama). */
export default function CartaoAutoridade({ p, destaque }: { p: Prefeito; destaque?: boolean }) {
  const mandato = mandatoTexto(p);
  return (
    <article className={`rounded-xl border bg-bg p-6 shadow-sm ${destaque ? 'border-primary/40' : 'border-border'}`}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className={`shrink-0 overflow-hidden rounded-xl bg-muted ${destaque ? 'h-44 w-36' : 'h-36 w-28'}`}>
          {p.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.fotoUrl} alt={`Foto de ${p.nome}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary/40"><Iniciais nome={p.nome} /></div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{cargoLabel(p)}</p>
          <h2 className="font-heading text-2xl font-bold text-fg">{p.nome}</h2>
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-fg/65 sm:justify-start">
            {p.partido && <span>{p.partido}</span>}
            {mandato && <span>Mandato {mandato}</span>}
          </div>
          {p.resumo && <p className="mt-3 text-sm text-fg/80">{p.resumo}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm sm:justify-start">
            {p.email && <a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a>}
            {p.telefone && <a href={`tel:${p.telefone}`} className="text-primary hover:underline">{p.telefone}</a>}
          </div>
        </div>
      </div>
    </article>
  );
}
