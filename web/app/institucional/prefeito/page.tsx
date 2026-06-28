import type { Metadata } from 'next';
import { getPrefeitos, type Prefeito } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import MuralExPrefeitos, { mandatoTexto } from './MuralExPrefeitos';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'O Prefeito(a)',
  description: 'Conheça o prefeito(a) e o vice-prefeito(a) do município, mandatos e a galeria de ex-prefeitos.',
};

/** Rótulo do cargo conforme tipo + gênero. */
function cargoLabel(p: Prefeito): string {
  const fem = p.genero === 'feminino';
  if (p.tipo === 'vice') return fem ? 'Vice-Prefeita' : 'Vice-Prefeito';
  return fem ? 'Prefeita' : 'Prefeito';
}
function tituloPagina(prefeito: Prefeito | null): string {
  if (!prefeito) return 'O Prefeito(a)';
  return prefeito.genero === 'feminino' ? 'A Prefeita' : 'O Prefeito';
}

function Iniciais({ nome }: { nome: string }) {
  const i = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return <span aria-hidden="true">{i}</span>;
}

function CartaoAutoridade({ p, destaque }: { p: Prefeito; destaque?: boolean }) {
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

export default async function PrefeitoPage() {
  const dados = await getPrefeitos();
  const prefeito = dados?.prefeito ?? null;
  const vice = dados?.vice ?? null;
  const anteriores = dados?.anteriores ?? [];

  const vazio = !prefeito && !vice && anteriores.length === 0;

  return (
    <PageContainer>
      <SecaoTitulo>{tituloPagina(prefeito)}</SecaoTitulo>

      {vazio ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          As informações do prefeito ainda não foram cadastradas.
        </p>
      ) : (
        <>
          {/* Titular + Vice */}
          <div className="grid gap-6 md:grid-cols-2">
            {prefeito && <CartaoAutoridade p={prefeito} destaque />}
            {vice && <CartaoAutoridade p={vice} />}
          </div>

          {/* Biografia do titular */}
          {prefeito?.historia && (
            <section className="mt-10">
              <h2 className="mb-3 border-b border-border pb-2 font-heading text-xl font-bold text-fg">Biografia</h2>
              <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: prefeito.historia }} />
            </section>
          )}

          {/* Galeria de ex-prefeitos */}
          {anteriores.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-1 font-heading text-xl font-bold text-fg">Galeria de ex-prefeitos</h2>
              <p className="mb-4 text-sm text-fg/60">Clique em uma foto para ver os mandatos e a história.</p>
              <MuralExPrefeitos lista={anteriores} />
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
