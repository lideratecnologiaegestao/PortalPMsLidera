'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ConfirmarPage() {
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [termo, setTermo] = useState('');

  useEffect(() => {
    if (!token) { setEstado('erro'); return; }
    fetch(`/api/diario/alertas/confirmar?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d?.ok) throw new Error();
        setTermo(d.termo ?? '');
        setEstado('ok');
      })
      .catch(() => setEstado('erro'));
  }, [token]);

  return (
    <section className="mx-auto max-w-xl px-4 py-8 space-y-4 text-center">
      <h1 className="font-heading text-2xl font-bold text-fg">Confirmação de alerta</h1>
      {estado === 'carregando' && <p className="text-fg/70">Confirmando…</p>}
      {estado === 'ok' && (
        <div className="rounded border border-success bg-success/10 p-5">
          <p className="font-semibold text-success">✓ Alerta confirmado!</p>
          <p className="mt-1 text-sm text-fg/80">
            Você será avisado quando {termo ? <strong>“{termo}”</strong> : 'seu termo'} aparecer numa nova edição do Diário Oficial.
          </p>
        </div>
      )}
      {estado === 'erro' && (
        <div className="rounded border border-danger bg-danger/10 p-5">
          <p className="font-semibold text-danger">Não foi possível confirmar</p>
          <p className="mt-1 text-sm text-fg/80">O link pode ter expirado ou já ter sido usado.</p>
        </div>
      )}
      <p><Link href="/diario" className="text-primary hover:underline">← Voltar ao Diário Oficial</Link></p>
    </section>
  );
}
