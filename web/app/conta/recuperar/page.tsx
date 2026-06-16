import RecuperarForm from '../../../components/portal/RecuperarForm';

export const metadata = { title: 'Recuperar senha' };

export default function RecuperarPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-bold">Recuperar senha</h1>
        <p className="text-fg/80">Enviaremos um código para o seu e-mail.</p>
      </header>
      <RecuperarForm />
    </section>
  );
}
