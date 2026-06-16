import VerificarContaForm from '../../../components/portal/VerificarContaForm';

export const metadata = { title: 'Confirmar conta' };

export default function VerificarContaPage({ searchParams }: { searchParams: { email?: string } }) {
  const email = searchParams.email ?? '';
  return (
    <section className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-bold">Confirmar conta</h1>
        <p className="text-fg/80">Informe os códigos que enviamos.</p>
      </header>
      <VerificarContaForm email={email} />
    </section>
  );
}
