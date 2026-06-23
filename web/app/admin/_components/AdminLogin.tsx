'use client';

import { useState } from 'react';
import { apiBase, govbrLoginUrl } from '../../../lib/auth-shared';
import Turnstile from '../../../components/ui/Turnstile';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  // Mudar esta key força re-mount do Turnstile (reset do widget)
  const [turnstileKey, setTurnstileKey] = useState(0);
  /**
   * turnstileAtivo: true quando o Turnstile notificou que está habilitado
   * (componente chama onToken('') ao montar com enabled=true).
   * Quando desabilitado, onToken nunca é chamado e o botão não é bloqueado.
   */
  const [turnstileAtivo, setTurnstileAtivo] = useState(false);

  function handleTurnstileToken(token: string) {
    // O Turnstile chama onToken('') imediatamente ao montar (se habilitado),
    // indicando "ativo, aguardando desafio". Qualquer chamada ativa a flag.
    if (!turnstileAtivo) setTurnstileAtivo(true);
    setTurnstileToken(token);
  }

  // Bloqueia submit se o Turnstile está ativo (habilitado) mas sem token válido
  const submitBloqueado = carregando || (turnstileAtivo && !turnstileToken);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha, turnstileToken: turnstileToken || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'E-mail ou senha inválidos.');
      }
      const body = await res.json().catch(() => ({}));
      if (body?.eulaRequired) {
        window.location.href = '/admin/ouvidor';
        return;
      }
      window.location.reload();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao autenticar.');
      // Reseta o widget em caso de erro
      setTurnstileToken('');
      setTurnstileKey((k) => k + 1);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <section
        className="w-full max-w-sm rounded border border-border bg-bg shadow-sm"
        aria-labelledby="login-titulo"
      >
        <div className="bg-primary px-6 py-4">
          <h1
            id="login-titulo"
            className="font-heading text-xl font-bold text-primary-fg"
          >
            Painel Administrativo
          </h1>
          <p className="mt-1 text-sm text-primary-fg/80">
            Acesso restrito a servidores e gestores municipais.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Login gov.br */}
          <a
            href={govbrLoginUrl('/admin')}
            className="flex w-full items-center justify-center gap-2 rounded border border-primary bg-bg px-4 py-2 font-semibold text-primary hover:bg-primary hover:text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
            Entrar com gov.br
          </a>

          <div className="relative flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-xs text-fg/50">ou</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          {/* Formulário e-mail/senha */}
          <form onSubmit={entrar} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="admin-email"
                className="mb-1 block text-sm font-medium text-fg"
              >
                E-mail institucional
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-fg placeholder:text-fg/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                placeholder="seu@municipio.gov.br"
                aria-required="true"
              />
            </div>

            <div>
              <label
                htmlFor="admin-senha"
                className="mb-1 block text-sm font-medium text-fg"
              >
                Senha
              </label>
              <input
                id="admin-senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded border border-border bg-bg px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-required="true"
              />
            </div>

            {/* Widget Turnstile — define turnstileAtivo ao receber primeiro evento */}
            <Turnstile
              key={turnstileKey}
              onToken={handleTurnstileToken}
            />

            {/* Mensagem de erro acessível */}
            {erro && (
              <p
                role="alert"
                aria-live="assertive"
                className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={submitBloqueado}
              className="w-full rounded bg-primary px-4 py-2 font-semibold text-primary-fg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 transition-opacity"
              aria-busy={carregando}
            >
              {carregando ? 'Autenticando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
