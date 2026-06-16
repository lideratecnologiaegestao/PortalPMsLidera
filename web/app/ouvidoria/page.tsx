import OuvidoriaForm from '../../components/portal/OuvidoriaForm';

export const metadata = {
  title: 'Ouvidoria',
  description:
    'Canal de Ouvidoria do município (Lei 13.460/2017): reclamações, denúncias, sugestões, elogios e solicitações — com opção anônima.',
};

export default function OuvidoriaPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">Ouvidoria Municipal</h1>
        <p className="max-w-3xl text-fg/80">
          A Ouvidoria é o canal direto entre você e a Prefeitura (Lei 13.460/2017).
          Registre reclamações, denúncias, sugestões, elogios e solicitações. Você
          recebe um <strong>número de protocolo</strong> e uma <strong>chave</strong>{' '}
          para acompanhar a tramitação e conversar com a ouvidoria.
        </p>
        <p className="text-sm">
          Já tem um protocolo?{' '}
          <a href="/acompanhar" className="font-semibold text-primary underline">
            Acompanhar manifestação
          </a>
          .
        </p>
      </header>

      <OuvidoriaForm />
    </section>
  );
}
