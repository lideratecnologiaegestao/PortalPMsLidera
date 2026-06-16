import EntrarForm from '../../components/portal/EntrarForm';

export const metadata = { title: 'Entrar' };

export default function EntrarPage({ searchParams }: { searchParams: { redirect?: string } }) {
  const redirect = searchParams.redirect && searchParams.redirect.startsWith('/') ? searchParams.redirect : '/cidadao';
  return (
    <section className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-bold">Entrar</h1>
        <p className="text-fg/80">Acesse com seu e-mail e senha, ou pelo gov.br.</p>
      </header>
      <EntrarForm redirect={redirect} />
    </section>
  );
}
