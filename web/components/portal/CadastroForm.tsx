'use client';

import { useState } from 'react';
import { cadastrar } from '../../lib/cidadao-auth';

export default function CadastroForm() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!nome.trim() || !email.trim() || senha.length < 8) {
      setErro('Preencha nome, e-mail e uma senha de ao menos 8 caracteres.'); return;
    }
    setCarregando(true);
    try {
      await cadastrar({ nome: nome.trim(), email: email.trim(), telefone: telefone.trim() || undefined, senha });
      window.location.href = `/conta/verificar?email=${encodeURIComponent(email.trim())}`;
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha no cadastro.');
    } finally { setCarregando(false); }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}
      <form onSubmit={criar} className="space-y-3" noValidate>
        <div>
          <label htmlFor="c-nome" className="text-sm font-medium">Nome completo</label>
          <input id="c-nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" />
        </div>
        <div>
          <label htmlFor="c-email" className="text-sm font-medium">E-mail</label>
          <input id="c-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="voce@email.com" />
        </div>
        <div>
          <label htmlFor="c-tel" className="text-sm font-medium">Celular (WhatsApp)</label>
          <input id="c-tel" inputMode="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="(DDD) 9xxxx-xxxx" />
        </div>
        <div>
          <label htmlFor="c-senha" className="text-sm font-medium">Senha</label>
          <input id="c-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" placeholder="mínimo 8 caracteres" />
        </div>
        <button type="submit" disabled={carregando}
          className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
          {carregando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="text-xs text-fg/60">
        Você receberá um código por <strong>e-mail</strong> e outro por <strong>WhatsApp</strong> para
        confirmar. Seus dados são tratados conforme a LGPD.
      </p>
      <p className="text-center text-sm">Já tem conta? <a href="/entrar" className="text-primary underline">Entrar</a></p>
    </div>
  );
}
