'use client';

import { useEffect, useId, useState } from 'react';
import { AdminApiError, adminGet, adminPost, adminPut } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface Config {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  imapHost: string;
  imapPort: number;
  ativo: boolean;
  senhaDefinida: boolean;
}

export default function EmailConfigPage() {
  const idb = useId();
  const [c, setC] = useState<Config | null>(null);
  const [senha, setSenha] = useState('');
  const [destinoTeste, setDestinoTeste] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    adminGet<Config>('/api/admin/config/email')
      .then(setC)
      .catch((e) => setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'));
  }, []);

  function campo<K extends keyof Config>(k: K, v: Config[K]) {
    setC((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function salvar() {
    if (!c) return;
    setSalvando(true); setErro(''); setOk('');
    try {
      const body = { ...c, smtpPass: senha || undefined };
      const novo = await adminPut<Config>('/api/admin/config/email', body);
      setC(novo);
      setSenha('');
      setOk('Configuração salva.');
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true); setErro(''); setOk('');
    try {
      const r = await adminPost<{ para: string }>('/api/admin/config/email/testar', { destino: destinoTeste || undefined });
      setOk(`E-mail de teste enviado para ${r.para}.`);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha no envio de teste.');
    } finally {
      setTestando(false);
    }
  }

  if (!c) return <p className="p-6 text-sm text-fg/60">{erro || 'Carregando…'}</p>;

  return (
    <main className="max-w-2xl space-y-5 p-4 md:p-6">
      <AdminHeader
        title="E-mail (SMTP/IMAP)"
        description="Configuração de e-mail do município. Cada prefeitura usa seu próprio domínio e caixa. Usado para notificar cidadãos e servidores."
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <section className={`${ui.card} space-y-4 p-4`}>
        <h2 className="font-heading font-semibold">Envio (SMTP)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${idb}-host`} className={ui.label}>Servidor SMTP</label>
            <input id={`${idb}-host`} className={`${ui.input} mt-1`} value={c.smtpHost}
              onChange={(e) => campo('smtpHost', e.target.value)} placeholder="smtp.seudominio.com.br" />
          </div>
          <div>
            <label htmlFor={`${idb}-port`} className={ui.label}>Porta</label>
            <input id={`${idb}-port`} type="number" className={`${ui.input} mt-1`} value={c.smtpPort}
              onChange={(e) => campo('smtpPort', Number(e.target.value))} placeholder="465" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.smtpSecure} onChange={(e) => campo('smtpSecure', e.target.checked)} />
              Conexão segura (SSL — porta 465)
            </label>
          </div>
          <div>
            <label htmlFor={`${idb}-user`} className={ui.label}>Usuário</label>
            <input id={`${idb}-user`} className={`${ui.input} mt-1`} value={c.smtpUser}
              onChange={(e) => campo('smtpUser', e.target.value)} placeholder="prefeitura@seudominio.com.br" autoComplete="off" />
          </div>
          <div>
            <label htmlFor={`${idb}-pass`} className={ui.label}>Senha</label>
            <input id={`${idb}-pass`} type="password" className={`${ui.input} mt-1`} value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={c.senhaDefinida ? '•••••••• (definida)' : 'senha do e-mail'} autoComplete="new-password" />
            <p className="mt-1 text-xs text-fg/60">Deixe em branco para manter a senha atual.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${idb}-from`} className={ui.label}>Remetente (From)</label>
            <input id={`${idb}-from`} className={`${ui.input} mt-1`} value={c.smtpFrom}
              onChange={(e) => campo('smtpFrom', e.target.value)} placeholder="prefeitura@seudominio.com.br" />
          </div>
        </div>
      </section>

      <section className={`${ui.card} space-y-4 p-4`}>
        <h2 className="font-heading font-semibold">Recebimento (IMAP) — opcional</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idb}-ihost`} className={ui.label}>Servidor IMAP</label>
            <input id={`${idb}-ihost`} className={`${ui.input} mt-1`} value={c.imapHost}
              onChange={(e) => campo('imapHost', e.target.value)} placeholder="imap.seudominio.com.br" />
          </div>
          <div>
            <label htmlFor={`${idb}-iport`} className={ui.label}>Porta IMAP</label>
            <input id={`${idb}-iport`} type="number" className={`${ui.input} mt-1`} value={c.imapPort}
              onChange={(e) => campo('imapPort', Number(e.target.value))} placeholder="993" />
          </div>
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.ativo} onChange={(e) => campo('ativo', e.target.checked)} />
        Notificações por e-mail ativas
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={ui.btn} disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar configuração'}
        </button>
        <div className="flex items-center gap-2">
          <input value={destinoTeste} onChange={(e) => setDestinoTeste(e.target.value)} type="email"
            placeholder="enviar teste para… (opcional)" className={`${ui.input} w-56`} />
          <button type="button" className={ui.btnGhost} disabled={testando} onClick={testar}>
            {testando ? 'Enviando…' : 'Enviar teste'}
          </button>
        </div>
      </div>
    </main>
  );
}
