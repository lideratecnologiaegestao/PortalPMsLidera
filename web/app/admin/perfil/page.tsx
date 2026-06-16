'use client';

import { useEffect, useRef, useState } from 'react';
import { apiBase } from '../../../lib/auth-shared';
import ContatosNotificacao from '../../../components/portal/ContatosNotificacao';
import { definirAvatar, urlAvatar } from '../../../lib/chat';

function AvatarPerfil({ userId }: { userId: string }) {
  const [v, setV] = useState(0); // cache-bust após upload
  const [erro, setErro] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro('');
    try { await definirAvatar(f); setV((x) => x + 1); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Falha.'); }
    finally { if (ref.current) ref.current.value = ''; }
  }
  return (
    <div className="rounded border border-border bg-bg p-4 space-y-3">
      <h2 className="font-heading text-base font-semibold text-fg">Foto de perfil</h2>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${urlAvatar(userId)}?v=${v}`} alt="" key={v}
          className="h-16 w-16 rounded-full border border-border object-cover bg-muted"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
        <label className="cursor-pointer rounded border border-primary px-4 py-2 text-sm font-semibold text-primary">
          Enviar foto
          <input ref={ref} type="file" accept="image/*" className="sr-only" onChange={enviar} />
        </label>
      </div>
      <p className="text-xs text-fg/60">Aparece para os colegas no chat interno. Imagem (recortada em 256×256).</p>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    </div>
  );
}

interface Perfil {
  id: string;
  nome: string;
  email: string;
  role: string;
  mfaHabilitado: boolean;
  govbrNivel: number | null;
}

const ROLE_LABEL: Record<string, string> = {
  servidor: 'Servidor',
  gestor: 'Gestor',
  admin: 'Administrador',
  ouvidor: 'Ouvidor',
  super_admin: 'Super Admin',
  cidadao: 'Cidadao',
};

const GOVBR_NIVEL: Record<number, string> = {
  1: 'Bronze',
  2: 'Prata',
  3: 'Ouro',
};

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  // Campos editaveis
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/auth/me/perfil`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Nao foi possivel carregar o perfil.');
        return res.json() as Promise<Perfil>;
      })
      .then((data) => {
        setPerfil(data);
        setNome(data.nome);
        setEmail(data.email);
      })
      .catch((e) => setErroCarregar(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setFeedback(null);

    const body: Record<string, string> = {};
    if (nome !== perfil?.nome) body.nome = nome;
    if (email !== perfil?.email) body.email = email;
    if (senhaAtual) body.senhaAtual = senhaAtual;
    if (novaSenha) body.novaSenha = novaSenha;

    try {
      const res = await fetch(`${apiBase}/api/auth/me/perfil`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Erro ao salvar perfil.');
      }
      const atualizado = await res.json() as Perfil;
      setPerfil(atualizado);
      setNome(atualizado.nome);
      setEmail(atualizado.email);
      setSenhaAtual('');
      setNovaSenha('');
      setFeedback({ tipo: 'sucesso', msg: 'Perfil atualizado com sucesso.' });
    } catch (err) {
      setFeedback({
        tipo: 'erro',
        msg: err instanceof Error ? err.message : 'Erro desconhecido.',
      });
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div aria-live="polite" aria-busy="true" className="text-fg/60">
        Carregando perfil…
      </div>
    );
  }

  if (erroCarregar) {
    return (
      <div role="alert" aria-live="assertive" className="rounded border border-danger bg-danger/10 p-4 text-danger">
        {erroCarregar}
      </div>
    );
  }

  if (!perfil) return null;

  return (
    <section aria-labelledby="perfil-titulo" className="mx-auto max-w-xl space-y-6">
      <h1 id="perfil-titulo" className="font-heading text-2xl font-bold text-fg">
        Meu perfil
      </h1>

      {/* Informacoes de conta (somente leitura) */}
      <div className="rounded border border-border bg-bg p-4 space-y-3">
        <h2 className="font-heading text-base font-semibold text-fg">Informacoes da conta</h2>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-semibold text-fg/70">Papel</dt>
          <dd className="text-fg">{ROLE_LABEL[perfil.role] ?? perfil.role}</dd>

          <dt className="font-semibold text-fg/70">MFA</dt>
          <dd className="text-fg">
            {perfil.mfaHabilitado ? (
              <span className="text-success font-medium">Habilitado</span>
            ) : (
              <span className="text-warning font-medium">Desabilitado</span>
            )}
          </dd>

          {perfil.govbrNivel !== null && (
            <>
              <dt className="font-semibold text-fg/70">Nivel gov.br</dt>
              <dd className="text-fg">
                {GOVBR_NIVEL[perfil.govbrNivel] ?? `Nivel ${perfil.govbrNivel}`}
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Formulario de edicao */}
      <form onSubmit={salvar} noValidate className="rounded border border-border bg-bg p-4 space-y-5">
        <h2 className="font-heading text-base font-semibold text-fg">Editar dados</h2>

        {/* Feedback acessivel */}
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded px-3 py-2 text-sm font-medium ${
              feedback.tipo === 'sucesso'
                ? 'border border-success bg-success/10 text-success'
                : 'border border-danger bg-danger/10 text-danger'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="perfil-nome" className="mb-1 block text-sm font-medium text-fg">
              Nome
            </label>
            <input
              id="perfil-nome"
              type="text"
              required
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>

          <div>
            <label htmlFor="perfil-email" className="mb-1 block text-sm font-medium text-fg">
              E-mail
            </label>
            <input
              id="perfil-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>
        </div>

        <fieldset className="rounded border border-border p-4 space-y-4">
          <legend className="px-1 text-sm font-semibold text-fg">Alterar senha (opcional)</legend>

          <div>
            <label htmlFor="perfil-senha-atual" className="mb-1 block text-sm font-medium text-fg">
              Senha atual
            </label>
            <input
              id="perfil-senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>

          <div>
            <label htmlFor="perfil-nova-senha" className="mb-1 block text-sm font-medium text-fg">
              Nova senha
            </label>
            <input
              id="perfil-nova-senha"
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={salvando}
          aria-busy={salvando}
          className="rounded bg-primary px-4 py-2 font-semibold text-primary-fg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 transition-opacity"
        >
          {salvando ? 'Salvando…' : 'Salvar alteracoes'}
        </button>
      </form>

      {/* Foto de perfil (chat interno) */}
      <AvatarPerfil userId={perfil.id} />

      {/* Contatos e preferências de notificação (WhatsApp/e-mail) */}
      <ContatosNotificacao />
    </section>
  );
}
