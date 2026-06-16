'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CancelarPage() {
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');

  useEffect(() => {
    if (!token) { setEstado('erro'); return; }
    fetch(`/api/diario/alertas/cancelar?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d?.ok) throw new Error();
        setEstado('ok');
      })
      .catch(() => setEstado('erro'));
  }, [token]);

  return (
    <section className="mx-auto max-w-xl px-4 py-8 space-y-4 text-center">
      <h1 className="font-heading text-2xl font-bold text-fg">Cancelamento de alerta</h1>
      {estado === 'carregando' && <p className="text-fg/70">Cancelando…</p>}
      {estado === 'ok' && (
        <div className="rounded border border-border bg-muted/30 p-5">
          <p className="font-semibold text-fg">Alerta cancelado</p>
          <p className="mt-1 text-sm text-fg/80">Você não receberá mais mensagens para este termo. Seus dados foram descartados desta finalidade.</p>
        </div>
      )}
      {estado === 'erro' && (
        <div className="rounded border border-danger bg-danger/10 p-5">
          <p className="font-semibold text-danger">Não foi possível processar</p>
          <p className="mt-1 text-sm text-fg/80">O link pode ser inválido ou o alerta já ter sido cancelado.</p>
        </div>
      )}
      <p><Link href="/diario" className="text-primary hover:underline">← Voltar ao Diário Oficial</Link></p>
    </section>
  );
}
