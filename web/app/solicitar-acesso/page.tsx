import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import SolicitarAcessoClient from './SolicitarAcessoClient';

export const metadata = { title: 'Solicitar acesso de servidor' };

/**
 * Página pública da área do cidadão para solicitar elevação de papel.
 * Exige autenticação — sem sessão redireciona para /entrar.
 * Server Component: busca secretarias no servidor para evitar flash.
 */
export default async function SolicitarAcessoPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar?redirect=/solicitar-acesso');

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Solicitar acesso de servidor</h1>
        <p className="text-sm text-fg/70">
          Você pode solicitar um acesso ampliado para colaborar com a prefeitura.
          A solicitação será avaliada e você receberá uma resposta por este portal.
        </p>
      </header>

      <div
        role="note"
        className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-fg"
      >
        <strong>Importante:</strong> Papéis de{' '}
        <strong>Ouvidor, Assistente de Ouvidoria e TI</strong> são analisados e
        aprovados exclusivamente pela equipe Lidera. Papéis de{' '}
        <strong>Gestor de conteúdo e Servidor</strong> são aprovados pela administração
        da sua prefeitura.
      </div>

      <SolicitarAcessoClient />
    </section>
  );
}
