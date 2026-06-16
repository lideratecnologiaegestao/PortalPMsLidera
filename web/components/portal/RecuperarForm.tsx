'use client';

import { useState } from 'react';
import { recuperar, redefinir } from '../../lib/cidadao-auth';

export default function RecuperarForm() {
  const [email, setEmail] = useState('');
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    try { await recuperar(email.trim()); setEtapa('codigo'); setMsg('Se houver conta, enviamos um código por e-mail.'); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Falha.'); }
    finally { setCarregando(false); }
  }
  async function redefinirSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (novaSenha.length < 8) { setErro('A nova senha deve ter ao menos 8 caracteres.'); return; }
    setCarregando(true);
    try { await redefinir(email.trim(), codigo.trim(), novaSenha); window.location.href = '/entrar'; }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível redefinir.'); }
    finally { setCarregando(false); }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}
      {msg && <p className="rounded border border-success/40 bg-success/5 p-3 text-sm text-success">{msg}</p>}

      {etapa === 'email' ? (
        <form onSubmit={enviar} className="space-y-3">
          <div>
            <label htmlFor="r-email" className="text-sm font-medium">E-mail</label>
            <input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="voce@email.com" />
          </div>
          <button type="submit" disabled={carregando} className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
            {carregando ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={redefinirSenha} className="space-y-3">
          <div>
            <label htmlFor="r-cod" className="text-sm font-medium">Código recebido</label>
            <input id="r-cod" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} required
              className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm font-mono" placeholder="000000" />
          </div>
          <div>
            <label htmlFor="r-senha" className="text-sm font-medium">Nova senha</label>
            <input id="r-senha" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required
              className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="mínimo 8 caracteres" />
          </div>
          <button type="submit" disabled={carregando} className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
            {carregando ? 'Salvando…' : 'Redefinir senha'}
          </button>
        </form>
      )}
    </div>
  );
}
