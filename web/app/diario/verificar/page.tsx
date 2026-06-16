import Link from 'next/link';
import { verificar } from '../../../lib/diario';
import { dataHora } from '../../../lib/format';

export const metadata = {
  title: 'Verificar autenticidade — Diário Oficial',
  description: 'Confira a autenticidade e integridade de uma edição do Diário Oficial pelo hash.',
};

type SP = Record<string, string | undefined>;

export default async function VerificarPage({ searchParams }: { searchParams: SP }) {
  const hash = searchParams.hash?.trim();
  const r = hash ? await verificar(hash) : null;

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <nav className="text-sm text-fg/60">
        <Link href="/diario" className="text-primary hover:underline">Diário Oficial</Link>
        <span> / Verificar autenticidade</span>
      </nav>

      <header>
        <h1 className="font-heading text-2xl font-bold text-fg">Verificar autenticidade</h1>
        <p className="mt-1 text-fg/70">
          Cole o código de autenticidade (hash SHA-256) impresso na edição para confirmar que
          ela é autêntica e não foi adulterada.
        </p>
      </header>

      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input
          name="hash"
          defaultValue={hash}
          placeholder="Hash SHA-256 da edição"
          aria-label="Hash da edição"
          className="flex-1 rounded border border-border bg-bg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button className="rounded bg-primary px-5 py-2 font-semibold text-primary-fg hover:opacity-90">
          Verificar
        </button>
      </form>

      {r && (() => {
        // 3 estados: autêntica (verde) · íntegra sem assinatura verificável (âmbar) · adulterada/não encontrada (vermelho)
        const encontrada = r.hashConfere !== undefined;
        const integro = !!r.hashConfere;
        const assinada = !!r.assinaturaConfere;
        const borda = !encontrada || !integro ? 'border-danger bg-danger/10' : assinada ? 'border-success bg-success/10' : 'border-warning bg-warning/10';
        return (
          <div className={`rounded border p-4 ${borda}`} role="status">
            {!encontrada || !integro ? (
              <p className="font-semibold text-danger">✗ {r.motivo ?? 'Edição não encontrada ou conteúdo adulterado.'}</p>
            ) : (
              <div className="space-y-1">
                <p className={`font-semibold ${assinada ? 'text-success' : 'text-fg'}`}>
                  {assinada ? '✓ Documento autêntico' : '✓ Conteúdo íntegro — assinatura digital pendente de certificado'}
                </p>
                <p className="text-sm text-fg/80">Edição nº {r.numero}, publicada em {dataHora(r.publicadoEm)}.</p>
                <p className="text-sm text-fg/80">
                  Integridade do conteúdo: <strong>confere</strong> · Assinatura digital: {assinada ? 'válida' : 'não verificável neste ambiente'}.
                </p>
                {r.numero && (
                  <p className="pt-1 text-sm">
                    <Link href={`/diario/${encodeURIComponent(r.numero)}`} className="text-primary hover:underline">Abrir edição →</Link>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
}
