'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AlertasPage() {
  const [termo, setTermo] = useState('');
  const [canal, setCanal] = useState<'email' | 'whatsapp'>('email');
  const [destino, setDestino] = useState('');
  const [consent, setConsent] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!consent) { setMsg({ tipo: 'erro', texto: 'É necessário concordar para receber os alertas.' }); return; }
    setEnviando(true);
    try {
      const res = await fetch('/api/diario/alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termo, canal, destino }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Falha ao cadastrar.');
      setMsg({ tipo: 'ok', texto: data?.mensagem ?? 'Verifique a confirmação enviada.' });
      setTermo(''); setDestino(''); setConsent(false);
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro inesperado.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <nav className="text-sm text-fg/60">
        <Link href="/diario" className="text-primary hover:underline">Diário Oficial</Link>
        <span> / Alertas por termo</span>
      </nav>

      <header>
        <h1 className="font-heading text-2xl font-bold text-fg">Receber alertas do Diário</h1>
        <p className="mt-1 text-fg/70">
          Cadastre um termo (por exemplo, seu nome) e seja avisado por e-mail ou WhatsApp sempre que
          ele aparecer numa nova edição do Diário Oficial.
        </p>
      </header>

      <form onSubmit={enviar} className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <label htmlFor="termo" className="block text-sm font-semibold">Termo a monitorar</label>
          <input
            id="termo" value={termo} onChange={(e) => setTermo(e.target.value)} required minLength={3}
            placeholder="Ex.: seu nome completo, nº de um contrato…"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Como deseja receber?</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="canal" checked={canal === 'email'} onChange={() => setCanal('email')} /> E-mail
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="canal" checked={canal === 'whatsapp'} onChange={() => setCanal('whatsapp')} /> WhatsApp
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="destino" className="block text-sm font-semibold">
            {canal === 'email' ? 'Seu e-mail' : 'Seu WhatsApp (com DDD)'}
          </label>
          <input
            id="destino" value={destino} onChange={(e) => setDestino(e.target.value)} required
            type={canal === 'email' ? 'email' : 'tel'}
            placeholder={canal === 'email' ? 'voce@exemplo.com' : '(66) 90000-0000'}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-fg/80">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>
            Concordo em receber os alertas no contato informado e que esses dados sejam usados
            <strong> apenas para esta finalidade</strong>. Sei que posso cancelar a qualquer momento pelo
            link presente em cada mensagem (LGPD).
          </span>
        </label>

        {msg && (
          <p role={msg.tipo === 'erro' ? 'alert' : 'status'}
            className={`rounded border p-3 text-sm ${msg.tipo === 'ok' ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}>
            {msg.texto}
          </p>
        )}

        <button disabled={enviando}
          className="rounded bg-primary px-5 py-2 font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50">
          {enviando ? 'Enviando…' : 'Cadastrar alerta'}
        </button>
        <p className="text-xs text-fg/60">
          Após cadastrar, enviaremos um link de confirmação ao seu contato (dupla verificação). O alerta
          só fica ativo depois que você confirmar.
        </p>
      </form>
    </section>
  );
}
