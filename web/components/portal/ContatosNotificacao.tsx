'use client';

import { useEffect, useState } from 'react';
import { apiBase } from '../../lib/auth-shared';

interface Contatos {
  whatsapp: string;
  whatsappVerificado: boolean;
  email: string;
  emailVerificado: boolean;
  notifWhatsapp: boolean;
  notifEmail: boolean;
  canais: { whatsapp: boolean; email: boolean };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}/api/me/contatos${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function Verificar({ canal, onVerificado }: { canal: 'whatsapp' | 'email'; onVerificado: (c: Contatos) => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const label = canal === 'whatsapp' ? 'WhatsApp' : 'e-mail';

  async function verificar() {
    setErro(''); setInfo('');
    try {
      const c = await api<Contatos>('/verificar', { method: 'POST', body: JSON.stringify({ canal, codigo: codigo.trim() }) });
      onVerificado(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
    }
  }
  async function reenviar() {
    setErro(''); setInfo('');
    try {
      await api('/reenviar', { method: 'POST', body: JSON.stringify({ canal }) });
      setInfo('Novo código enviado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
    }
  }

  return (
    <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm">Enviamos um código de verificação para seu {label}. Informe-o abaixo:</p>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      {info && <p className="text-sm text-success">{info}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" maxLength={6}
          placeholder="000000" className="w-28 rounded border border-border bg-bg px-2 py-1 text-sm font-mono" />
        <button type="button" onClick={verificar} className="rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-fg">Verificar</button>
        <button type="button" onClick={reenviar} className="text-sm text-primary underline">Reenviar código</button>
      </div>
    </div>
  );
}

/**
 * Contatos e preferências de notificação do usuário (cidadão ou interno).
 * Cadastra WhatsApp + e-mail com verificação por código e opt-in por canal.
 * A cada nova tramitação, quem deve agir recebe aviso (sem dado sensível).
 */
export default function ContatosNotificacao() {
  const [c, setC] = useState<Contatos | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api<Contatos>('')
      .then((d) => { setC(d); setWhatsapp(d.whatsapp); setEmail(d.email); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'));
  }, []);

  async function salvar(patch: Partial<Contatos>) {
    setSalvando(true); setErro(''); setOk('');
    try {
      const novo = await api<Contatos>('', {
        method: 'PUT',
        body: JSON.stringify({
          whatsapp, email,
          notifWhatsapp: patch.notifWhatsapp ?? c?.notifWhatsapp,
          notifEmail: patch.notifEmail ?? c?.notifEmail,
          ...patch,
        }),
      });
      setC(novo);
      setOk('Preferências salvas.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!c) return <p className="text-sm text-fg/60">{erro || 'Carregando…'}</p>;

  const Badge = ({ ok: v }: { ok: boolean }) => (
    <span className={`rounded-full px-2 py-0.5 text-xs ${v ? 'bg-success/20 text-success' : 'bg-muted text-fg/60'}`}>
      {v ? 'verificado' : 'não verificado'}
    </span>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-heading text-lg font-semibold">Contatos e notificações</h3>
        <p className="text-sm text-fg/70">
          Receba avisos por WhatsApp e e-mail quando houver novidade nas suas manifestações.
          O aviso traz apenas o protocolo e um link — nunca o conteúdo.
        </p>
      </div>

      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      {ok && <p className="text-sm text-success">{ok}</p>}

      {/* WhatsApp */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="ct-wa" className="text-sm font-medium">WhatsApp</label>
          <Badge ok={c.whatsappVerificado} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input id="ct-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="(00) 00000-0000" className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={c.notifWhatsapp} onChange={(e) => salvar({ notifWhatsapp: e.target.checked })} /> avisar
          </label>
        </div>
        {!c.canais.whatsapp && <p className="mt-1 text-xs text-fg/50">Canal WhatsApp indisponível no momento.</p>}
        {!c.whatsappVerificado && c.whatsapp && (
          <Verificar canal="whatsapp" onVerificado={setC} />
        )}
      </div>

      {/* E-mail */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="ct-email" className="text-sm font-medium">E-mail</label>
          <Badge ok={c.emailVerificado} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com" className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={c.notifEmail} onChange={(e) => salvar({ notifEmail: e.target.checked })} /> avisar
          </label>
        </div>
        {!c.canais.email && <p className="mt-1 text-xs text-fg/50">Envio de e-mail indisponível no momento (SMTP não configurado).</p>}
        {!c.emailVerificado && c.email && (
          <Verificar canal="email" onVerificado={setC} />
        )}
      </div>

      <button type="button" onClick={() => salvar({})} disabled={salvando}
        className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
        {salvando ? 'Salvando…' : 'Salvar contatos'}
      </button>
    </div>
  );
}
