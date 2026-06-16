import { getCurrentUser } from '../../lib/auth';
import { govbrLoginUrl } from '../../lib/auth-shared';
import EsicForm from '../../components/portal/EsicForm';

export const metadata = {
  title: 'e-SIC — Acesso à Informação',
  description:
    'Serviço de Informação ao Cidadão (LAI 12.527/2011): solicite informações públicas ao município. Exige identificação (login gov.br).',
};

export default async function EsicPage() {
  const user = await getCurrentUser();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">e-SIC — Acesso à Informação</h1>
        <p className="max-w-3xl text-fg/80">
          Pela Lei de Acesso à Informação (Lei 12.527/2011), você pode solicitar
          qualquer informação pública ao município. O pedido <strong>exige
          identificação</strong> — por isso é necessário entrar com o gov.br.
        </p>
        <p className="text-sm">
          Já tem um protocolo?{' '}
          <a href="/acompanhar" className="font-semibold text-primary underline">Acompanhar pedido</a>.
          {' '}Consulte também as{' '}
          <a href="/esic/estatisticas" className="font-semibold text-primary underline">
            estatísticas públicas do e-SIC
          </a>.
        </p>
      </header>

      {user ? (
        <EsicForm />
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <h2 className="font-heading text-lg font-semibold">Identificação necessária</h2>
          <p className="mt-1 text-sm text-fg/80">
            Para registrar um pedido de acesso à informação, entre com sua conta gov.br.
          </p>
          <a
            href={govbrLoginUrl('/esic')}
            className="mt-3 inline-flex rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
          >
            Entrar com gov.br
          </a>
        </div>
      )}
    </section>
  );
}
