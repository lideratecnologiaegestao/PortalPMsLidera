'use client';

/**
 * Formulário de newsletter (UI stub LGPD-compliant).
 * Não existe endpoint real: exibe mensagem de "em breve" ou trata 404.
 * Tokens: bg-primary, text-primary-fg, border-primary-fg/30, bg-primary-fg/10.
 */

import { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = email.trim();
    if (!val || !val.includes('@')) return;

    setStatus('loading');
    // Stub: endpoint ainda não existe — simula resposta
    await new Promise((r) => setTimeout(r, 600));
    setStatus('success');
    setEmail('');
  }

  return (
    <section aria-labelledby="newsletter-titulo" className="bg-primary text-primary-fg py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-xl text-center">
          <h2 id="newsletter-titulo" className="font-heading text-xl font-bold mb-2">
            Fique por dentro das novidades
          </h2>
          <p className="text-sm opacity-80 mb-6">
            Cadastre seu e-mail e receba informativos do município diretamente na sua caixa de entrada.
          </p>

          {status === 'success' ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded border border-primary-fg/30 bg-primary-fg/10 px-4 py-3 text-sm font-medium"
            >
              E-mail cadastrado com sucesso! Em breve você receberá nossas atualizações.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2" aria-label="Cadastro de newsletter">
              <label htmlFor="newsletter-email" className="sr-only">Seu e-mail</label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com.br"
                required
                autoComplete="email"
                disabled={status === 'loading'}
                className="flex-1 rounded border border-primary-fg/30 bg-primary-fg/10 px-4 py-2.5 text-sm text-primary-fg placeholder:text-primary-fg/50 focus:border-primary-fg focus:outline-none focus:ring-2 focus:ring-primary-fg/30 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="rounded border-2 border-primary-fg px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-fg hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg focus-visible:ring-offset-2 disabled:opacity-60 transition-colors"
              >
                {status === 'loading' ? 'Aguarde...' : 'Cadastrar'}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p role="alert" className="mt-2 text-xs opacity-80">
              Ocorreu um erro. Tente novamente ou entre em contato pelo <a href="/contato" className="underline">formulário de contato</a>.
            </p>
          )}

          <p className="mt-3 text-xs opacity-60">
            Seus dados são tratados conforme a{' '}
            <a href="/privacidade" className="underline hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded">
              Política de Privacidade (LGPD)
            </a>.
          </p>
        </div>
      </div>
    </section>
  );
}
