import type { Metadata } from 'next';
import { getPrefeitos } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import MuralExPrefeitos from '../prefeito/MuralExPrefeitos';

export const metadata: Metadata = {
  title: 'Galeria de Ex-Prefeitos',
  description: 'Mural dos ex-prefeitos do município, com mandatos e história de cada um.',
};

export default async function ExPrefeitosPage() {
  const dados = await getPrefeitos();
  const anteriores = dados?.anteriores ?? [];

  return (
    <PageContainer>
      <SecaoTitulo>Galeria de Ex-Prefeitos</SecaoTitulo>

      {anteriores.length === 0 ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          Nenhum ex-prefeito cadastrado ainda.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-fg/60">Clique em uma foto para ver os mandatos e a história.</p>
          <MuralExPrefeitos lista={anteriores} />
        </>
      )}
    </PageContainer>
  );
}
