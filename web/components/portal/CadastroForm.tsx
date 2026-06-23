'use client';

import { useState } from 'react';
import { registrar } from '../../lib/cidadao-auth';
import Turnstile from '../ui/Turnstile';

/**
 * Formulário de autocadastro público do cidadão.
 * Usa POST /api/auth/registrar → cria conta com papel `cidadao`.
 * Após o cadastro redireciona para o painel do cidadão (já autenticado).
 */
export default function CadastroForm() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
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

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    if (!nome.trim()) { setErro('Informe seu nome completo.'); return; }
    if (!email.trim()) { setErro('Informe seu e-mail.'); return; }
    if (senha.length < 8) { setErro('A senha deve ter ao menos 8 caracteres.'); return; }
    if (senha !== confirmarSenha) { setErro('As senhas não conferem.'); return; }

    setCarregando(true);
    try {
      await registrar({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        turnstileToken: turnstileToken || undefined,
      });
      // Redireciona para o painel do cidadão (sessão já criada pelo cookie HttpOnly)
      window.location.href = '/cidadao';
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha no cadastro.');
      // Reseta o widget após erro
      setTurnstileToken('');
      setTurnstileKey((k) => k + 1);
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

      <form onSubmit={criar} className="space-y-3" noValidate>
        <div>
          <label htmlFor="c-nome" className="text-sm font-medium">
            Nome completo <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <input
            id="c-nome"
            type="text"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            aria-required="true"
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Maria da Silva"
          />
        </div>

        <div>
          <label htmlFor="c-email" className="text-sm font-medium">
            E-mail <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <input
            id="c-email"
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
          <label htmlFor="c-senha" className="text-sm font-medium">
            Senha <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <input
            id="c-senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            aria-required="true"
            aria-describedby="c-senha-dica"
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="mínimo 8 caracteres"
          />
          <p id="c-senha-dica" className="mt-0.5 text-xs text-fg/50">
            Use ao menos 8 caracteres.
          </p>
        </div>

        <div>
          <label htmlFor="c-confirmar" className="text-sm font-medium">
            Confirmar senha <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <input
            id="c-confirmar"
            type="password"
            autoComplete="new-password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            required
            aria-required="true"
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="repita a senha"
          />
        </div>

        <Turnstile key={turnstileKey} onToken={handleTurnstileToken} />

        <button
          type="submit"
          disabled={submitBloqueado}
          className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-busy={carregando}
        >
          {carregando ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>

      <p className="text-xs text-fg/60 text-center">
        Seus dados são tratados conforme a{' '}
        <a href="/privacidade/sobre-lgpd" className="underline">LGPD</a>.
      </p>

      <p className="text-center text-sm">
        Já tem conta?{' '}
        <a href="/entrar" className="text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Entrar
        </a>
      </p>
    </div>
  );
}
