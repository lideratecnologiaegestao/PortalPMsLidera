'use client';

import { useState } from 'react';
import { login } from '../../lib/cidadao-auth';
import { govbrLoginUrl } from '../../lib/auth-shared';

export default function EntrarForm({ redirect = '/cidadao' }: { redirect?: string }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setCarregando(true);
    try {
      await login(email.trim(), senha);
      window.location.href = redirect;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar.';
      setErro(msg);
      if (/confirme seu e-mail/i.test(msg)) {
        window.location.href = `/conta/verificar?email=${encodeURIComponent(email.trim())}`;
      }
    } finally { setCarregando(false); }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}

      <form onSubmit={entrar} className="space-y-3" noValidate>
        <div>
          <label htmlFor="e-email" className="text-sm font-medium">E-mail</label>
          <input id="e-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="voce@email.com" />
        </div>
        <div>
          <label htmlFor="e-senha" className="text-sm font-medium">Senha</label>
          <input id="e-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={carregando}
          className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-sm">
        <a href="/conta/recuperar" className="text-primary underline">Esqueci minha senha</a>
      </p>

      <div className="flex items-center gap-3 text-sm text-fg/50">
        <span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" />
      </div>

      <a href={govbrLoginUrl(redirect)} className="block rounded border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary">
        Entrar com gov.br
      </a>
      <a href={`/cadastro?redirect=${encodeURIComponent(redirect)}`} className="block rounded bg-muted/40 px-4 py-2.5 text-center text-sm font-semibold">
        Criar conta
      </a>
    </div>
  );
}
