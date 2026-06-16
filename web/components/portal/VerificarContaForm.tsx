'use client';

import { useState } from 'react';
import { reenviar, verificar } from '../../lib/cidadao-auth';

export default function VerificarContaForm({ email }: { email: string }) {
  const [codEmail, setCodEmail] = useState('');
  const [codTel, setCodTel] = useState('');
  const [emailOk, setEmailOk] = useState(false);
  const [telOk, setTelOk] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  async function confirmar(finalidade: 'email' | 'telefone', codigo: string) {
    setErro(''); setMsg('');
    try {
      await verificar(email, finalidade, codigo.trim());
      if (finalidade === 'email') setEmailOk(true); else setTelOk(true);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Código inválido.'); }
  }
  async function reenviarCod(finalidade: 'email' | 'telefone') {
    setErro(''); setMsg('');
    try { await reenviar(email, finalidade); setMsg('Novo código enviado.'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao reenviar.'); }
  }

  const box = 'rounded-lg border border-border p-4 space-y-2';
  return (
    <div className="mx-auto max-w-md space-y-4">
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}
      {msg && <p className="rounded border border-success/40 bg-success/5 p-3 text-sm text-success">{msg}</p>}
      <p className="text-sm text-fg/70">Enviamos um código para <strong>{email}</strong>.</p>

      {/* E-mail */}
      <div className={box}>
        <p className="font-semibold">{emailOk ? '✓ E-mail confirmado' : 'Confirmar e-mail'}</p>
        {!emailOk && (
          <>
            <input inputMode="numeric" maxLength={6} value={codEmail} onChange={(e) => setCodEmail(e.target.value)}
              placeholder="000000" className="w-full rounded border border-border bg-bg p-2 text-sm font-mono" />
            <div className="flex gap-2">
              <button onClick={() => confirmar('email', codEmail)} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Confirmar e-mail</button>
              <button onClick={() => reenviarCod('email')} className="text-sm text-primary underline">Reenviar</button>
            </div>
          </>
        )}
      </div>

      {/* WhatsApp */}
      <div className={box}>
        <p className="font-semibold">{telOk ? '✓ WhatsApp confirmado' : 'Confirmar WhatsApp'}</p>
        {!telOk && (
          <>
            <input inputMode="numeric" maxLength={6} value={codTel} onChange={(e) => setCodTel(e.target.value)}
              placeholder="000000" className="w-full rounded border border-border bg-bg p-2 text-sm font-mono" />
            <div className="flex gap-2">
              <button onClick={() => confirmar('telefone', codTel)} className="rounded border border-primary px-4 py-2 text-sm font-semibold text-primary">Confirmar WhatsApp</button>
              <button onClick={() => reenviarCod('telefone')} className="text-sm text-primary underline">Reenviar</button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-fg/60">O e-mail é obrigatório para entrar; o WhatsApp confirma seu número para avisos.</p>
      {emailOk && <a href="/entrar" className="block rounded bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-fg">Ir para o login</a>}
    </div>
  );
}
