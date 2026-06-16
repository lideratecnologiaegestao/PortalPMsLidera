'use client';

import { useState, FormEvent } from 'react';
import { apiBase } from '../../../lib/auth-shared';
import { Aviso } from '../../admin/_components/ui';

/**
 * Formulário de login do Gerenciador da Plataforma.
 * Chamado pelo PlataformaLayout quando não há super_admin autenticado.
 * Centralizado na tela, segue tokens gov.br (sem cor fixa).
 */
export default function PlataformaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const res = await fetch(`${apiBase}/api/_platform/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });

      if (!res.ok) {
        let msg = 'E-mail ou senha inválidos.';
        try {
          const j = await res.json();
          if (j?.message) {
            msg = Array.isArray(j.message) ? j.message.join('; ') : j.message;
          }
        } catch {
          /* corpo não-JSON */
        }
        setErro(msg);
        return;
      }

      // Sucesso: recarrega a página para que o Server Component detecte o cookie
      window.location.reload();
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded border border-border bg-bg p-8 shadow-md">
        {/* Cabeçalho */}
        <div className="mb-6 text-center">
          {/* Ícone simbólico - escudo gov.br */}
          <span
            aria-hidden="true"
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg text-xl font-bold"
          >
            G
          </span>
          <h1 className="font-heading text-xl font-bold text-fg">
            Gerenciador da Plataforma
          </h1>
          <p className="mt-1 text-sm text-fg/60">Acesso restrito a super_admin</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="platform-email" className="block text-sm font-semibold text-fg">
              E-mail
            </label>
            <input
              id="platform-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="admin@plataforma.gov.br"
              aria-required="true"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="platform-senha" className="block text-sm font-semibold text-fg">
              Senha
            </label>
            <input
              id="platform-senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-required="true"
            />
          </div>

          {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
