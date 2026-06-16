import type { Metadata } from 'next';
import PageContainer from '../../../components/portal/PageContainer';
import { getLgpdPublico } from '../../../lib/portal-api';

export const metadata: Metadata = {
  title: 'Privacidade e Proteção de Dados (LGPD)',
  description: 'Documentação de privacidade e proteção de dados pessoais da entidade, em conformidade com a Lei nº 13.709/2018 (LGPD).',
};

export default async function SobreLgpdPage() {
  const doc = await getLgpdPublico();

  if (!doc) {
    return (
      <PageContainer largura="estreito">
        <nav aria-label="Trilha" className="mb-4 text-sm">
          <a href="/" className="underline">Início</a> ›{' '}
          <a href="/privacidade" className="underline">Privacidade</a> › LGPD
        </nav>
        <h1 className="font-heading text-2xl font-bold">Privacidade e Proteção de Dados (LGPD)</h1>
        <p className="mt-4 rounded border border-border bg-muted/30 p-6 text-center text-sm text-fg/60">
          A documentação de privacidade e proteção de dados desta entidade ainda não foi publicada.
        </p>
      </PageContainer>
    );
  }

  const atualizado = doc.atualizadoEm
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(doc.atualizadoEm))
    : null;

  return (
    <PageContainer largura="estreito">
      <nav aria-label="Trilha" className="mb-4 text-sm">
        <a href="/" className="underline">Início</a> ›{' '}
        <a href="/privacidade" className="underline">Privacidade</a> › LGPD
      </nav>
      <h1 className="font-heading text-2xl font-bold">Privacidade e Proteção de Dados (LGPD)</h1>
      {atualizado && (
        <p className="mt-1 text-xs text-fg/50">Atualizado em {atualizado}.</p>
      )}

      {/* Estilo escopado para o conteúdo gerado (fragmento HTML). */}
      <style>{`
        .lgpd-conteudo { margin-top: 1.5rem; line-height: 1.7; }
        .lgpd-conteudo h2.lgpd-doc-titulo {
          font-size: 1.3rem; font-weight: 700; margin: 2.4rem 0 .8rem;
          padding-bottom: .3rem; border-bottom: 2px solid var(--color-primary);
          color: var(--color-primary);
        }
        .lgpd-conteudo h2.lgpd-doc-titulo:first-child { margin-top: 0; }
        .lgpd-conteudo h3 { font-size: 1.1rem; font-weight: 700; margin: 1.6rem 0 .5rem; }
        .lgpd-conteudo h4 { font-size: 1rem; font-weight: 600; margin: 1.2rem 0 .4rem; }
        .lgpd-conteudo p { margin: .6rem 0; text-align: justify; }
        .lgpd-conteudo ul { margin: .6rem 0; padding-left: 1.4rem; list-style: disc; }
        .lgpd-conteudo li { margin: .25rem 0; }
      `}</style>
      <article
        className="lgpd-conteudo text-fg/90"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </PageContainer>
  );
}
