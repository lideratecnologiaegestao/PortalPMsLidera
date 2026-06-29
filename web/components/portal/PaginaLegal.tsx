import { getPolitica } from '../../lib/portal-api';
import PageContainer from './PageContainer';
import SecaoTitulo from './SecaoTitulo';
import ConteudoRico from './ConteudoRico';

/** Página pública de um documento legal (acessibilidade | privacidade | cookies). */
export default async function PaginaLegal({
  tipo, tituloPadrao, extra,
}: {
  tipo: 'acessibilidade' | 'privacidade' | 'cookies';
  tituloPadrao: string;
  extra?: React.ReactNode;
}) {
  const d = await getPolitica(tipo);
  const titulo = d?.titulo?.trim() || tituloPadrao;

  return (
    <PageContainer>
      <SecaoTitulo>{titulo}</SecaoTitulo>
      {extra}
      {!d ? (
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          Este documento ainda não foi cadastrado.
        </p>
      ) : (
        <>
          <ConteudoRico formato={d.formato} conteudo={d.conteudo} />
          {d.atualizadoEm && (
            <p className="mt-8 border-t border-border pt-3 text-xs text-fg/50">
              Versão {d.versao} — atualizado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(d.atualizadoEm))}.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
