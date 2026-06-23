'use client';

import { useState } from 'react';
import { login } from '../../lib/cidadao-auth';
import { govbrLoginUrl } from '../../lib/auth-shared';
import Turnstile from '../ui/Turnstile';

export default function EntrarForm({ redirect = '/cidadao' }: { redirect?: string }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileAtivo, setTurnstileAtivo] = useState(false);

  function handleTurnstileToken(token: string) {
    if (!turnstileAtivo) setTurnstileAtivo(true);
    setTurnstileToken(token);
  }

  const submitBloqueado = carregando || (turnstileAtivo && !turnstileToken);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      await login(email.trim(), senha, turnstileToken || undefined);
      window.location.href = redirect;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar.';
      setErro(msg);
      // Reseta o widget após erro
      setTurnstileToken('');
      setTurnstileKey((k) => k + 1);
      if (/confirme seu e-mail/i.test(msg)) {
        window.location.href = `/conta/verificar?email=${encodeURIComponent(email.trim())}`;
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {erro && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erro}
        </p>
      )}

      <form onSubmit={entrar} className="space-y-3" noValidate>
        <div>
          <label htmlFor="e-email" className="text-sm font-medium">E-mail</label>
          <input
            id="e-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="voce@email.com"
          />
        </div>
        <div>
          <label htmlFor="e-senha" className="text-sm font-medium">Senha</label>
          <input
            id="e-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            aria-required="true"
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="••••••••"
          />
        </div>

        <Turnstile key={turnstileKey} onToken={handleTurnstileToken} />

        <button
          type="submit"
          disabled={submitBloqueado}
          className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-busy={carregando}
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-sm">
        <a href="/conta/recuperar" className="text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">
          Esqueci minha senha
        </a>
      </p>

      <div className="flex items-center gap-3 text-sm text-fg/50">
        <span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" />
      </div>

      <a
        href={govbrLoginUrl(redirect)}
        className="block rounded border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        Entrar com gov.br
      </a>
      <a
        href={`/cadastro?redirect=${encodeURIComponent(redirect)}`}
        className="block rounded bg-muted/40 px-4 py-2.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        Criar conta
      </a>
    </div>
  );
}
