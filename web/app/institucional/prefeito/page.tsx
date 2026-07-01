import type { Metadata } from 'next';
import { getPrefeitos, type Prefeito } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import CartaoAutoridade from './CartaoAutoridade';

export const metadata: Metadata = {
  title: 'O Prefeito(a)',
  description: 'Conheça o prefeito(a) do município, mandato e biografia.',
};

function tituloPagina(prefeito: Prefeito | null): string {
  if (!prefeito) return 'O Prefeito(a)';
  return prefeito.genero === 'feminino' ? 'A Prefeita' : 'O Prefeito';
}

export default async function PrefeitoPage() {
  const dados = await getPrefeitos();
  const prefeito = dados?.prefeito ?? null;
  const primeiraDama = dados?.primeiraDama ?? null;

  return (
    <PageContainer>
      <SecaoTitulo>{tituloPagina(prefeito)}</SecaoTitulo>

      {!prefeito ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          As informações do prefeito ainda não foram cadastradas.
        </p>
      ) : (
        <>
          <CartaoAutoridade p={prefeito} destaque />

          {/* Biografia do titular */}
          {prefeito.historia && (
            <section className="mt-10">
              <h2 className="mb-3 border-b border-border pb-2 font-heading text-xl font-bold text-fg">Biografia</h2>
              <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: prefeito.historia }} />
            </section>
          )}

          {/* Primeira-dama (se cadastrada) */}
          {primeiraDama && (
            <section className="mt-12">
              <h2 className="mb-4 font-heading text-xl font-bold text-fg">{primeiraDama.genero === 'masculino' ? 'Primeiro-cavalheiro' : 'Primeira-dama'}</h2>
              <CartaoAutoridade p={primeiraDama} />
              {primeiraDama.historia && (
                <div className="prose-portal mt-4 max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: primeiraDama.historia }} />
              )}
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
