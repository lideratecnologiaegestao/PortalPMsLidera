import CadastroForm from '../../components/portal/CadastroForm';

export const metadata = { title: 'Criar conta' };

export default function CadastroPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-8 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-bold">Criar conta</h1>
        <p className="text-fg/80">Cadastre-se com e-mail e senha — não é preciso ter gov.br.</p>
      </header>
      <CadastroForm />
    </section>
  );
}
