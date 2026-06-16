import AcompanharClient from '../../components/portal/AcompanharClient';

export const metadata = {
  title: 'Acompanhar manifestação',
  description: 'Consulte o andamento da sua manifestação de Ouvidoria ou pedido e-SIC pelo protocolo e chave.',
};

export default function AcompanharPage({
  searchParams,
}: {
  searchParams: { protocolo?: string; chave?: string };
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">Acompanhar manifestação</h1>
        <p className="max-w-3xl text-fg/80">
          Informe o <strong>protocolo</strong> e a <strong>chave de acompanhamento</strong>{' '}
          recebidos no registro. Você verá o status, os prazos e poderá conversar
          com a ouvidoria. Se você estiver logado, suas manifestações também
          aparecem no <a href="/cidadao" className="text-primary underline">seu painel</a>.
        </p>
      </header>

      <AcompanharClient protocoloInicial={searchParams.protocolo} chaveInicial={searchParams.chave} />
    </section>
  );
}
