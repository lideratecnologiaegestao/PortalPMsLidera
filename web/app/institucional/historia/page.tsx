import type { Metadata } from 'next';
import { getHistoriaMunicipio } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import ConteudoRico from '../../../components/portal/ConteudoRico';

export const metadata: Metadata = {
  title: 'História do Município',
  description: 'A história do município: origem, formação e marcos.',
};

export default async function HistoriaPage() {
  const h = await getHistoriaMunicipio();
  const titulo = h?.titulo?.trim() || 'História do Município';

  return (
    <PageContainer>
      <SecaoTitulo>{titulo}</SecaoTitulo>

      {!h ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          A história do município ainda não foi cadastrada.
        </p>
      ) : (
        <article>
          {h.imagemUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.imagemUrl} alt={titulo} className="mb-6 max-h-96 w-full rounded-lg object-cover" />
          )}
          <ConteudoRico formato={h.formato} conteudo={h.conteudo} />
        </article>
      )}
    </PageContainer>
  );
}
