import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import MeusDadosClient from './MeusDadosClient';

export const metadata = {
  title: 'Meus Dados e Direitos (LGPD)',
  description:
    'Consulte, exporte e exerça seus direitos sobre os dados pessoais que a prefeitura possui sobre você, conforme a Lei Geral de Proteção de Dados (LGPD).',
};

/**
 * Página "Meus Dados e Direitos" — área do cidadão autenticado.
 * Proteção idêntica à /cidadao: sem sessão redireciona para /entrar.
 * O conteúdo interativo fica em MeusDadosClient (Client Component).
 */
export default async function MeusDadosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar?redirect=/cidadao/meus-dados');

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <nav aria-label="Trilha de navegação">
          <ol className="flex flex-wrap gap-1 text-sm text-fg/60">
            <li>
              <a href="/cidadao" className="text-primary underline hover:opacity-80">
                Painel do Cidadão
              </a>
            </li>
            <li aria-hidden="true" className="select-none"> / </li>
            <li aria-current="page" className="font-medium text-fg">
              Meus Dados e Direitos
            </li>
          </ol>
        </nav>

        <h1 className="font-heading text-2xl font-bold">
          Meus Dados e Direitos (LGPD)
        </h1>

        <div className="rounded border border-border bg-muted/40 p-4 text-sm space-y-2">
          <p className="font-semibold">
            Seus direitos como titular de dados pessoais (LGPD, art. 18)
          </p>
          <ul className="list-disc pl-5 space-y-1 text-fg/80">
            <li>Confirmar se seus dados são tratados pelo órgão.</li>
            <li>Acessar e exportar uma cópia dos seus dados.</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
            <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.</li>
            <li>Obter informações sobre com quem seus dados foram compartilhados.</li>
            <li>Revogar o consentimento dado anteriormente.</li>
            <li>Solicitar a portabilidade dos dados para outro serviço.</li>
            <li>Opor-se ao tratamento de dados.</li>
            <li>Solicitar revisão de decisões automatizadas que afetem seus interesses.</li>
          </ul>
          <p className="text-xs text-fg/60 pt-1">
            O prazo legal para resposta é de até <strong>15 dias corridos</strong> (LGPD, art. 19).
          </p>
        </div>
      </header>

      <MeusDadosClient />
    </section>
  );
}
