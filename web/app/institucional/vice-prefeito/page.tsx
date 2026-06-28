import type { Metadata } from 'next';
import { getPrefeitos } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import CartaoAutoridade from '../prefeito/CartaoAutoridade';

export const metadata: Metadata = {
  title: 'Vice-Prefeito(a)',
  description: 'Conheça o vice-prefeito(a) do município, mandato e biografia.',
};

export default async function VicePrefeitoPage() {
  const dados = await getPrefeitos();
  const vice = dados?.vice ?? null;
  const titulo = vice ? (vice.genero === 'feminino' ? 'A Vice-Prefeita' : 'O Vice-Prefeito') : 'Vice-Prefeito(a)';

  return (
    <PageContainer>
      <SecaoTitulo>{titulo}</SecaoTitulo>

      {!vice ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          As informações do vice-prefeito ainda não foram cadastradas.
        </p>
      ) : (
        <>
          <CartaoAutoridade p={vice} destaque />
          {vice.historia && (
            <section className="mt-10">
              <h2 className="mb-3 border-b border-border pb-2 font-heading text-xl font-bold text-fg">Biografia</h2>
              <div className="prose-portal max-w-none text-fg/85" dangerouslySetInnerHTML={{ __html: vice.historia }} />
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
