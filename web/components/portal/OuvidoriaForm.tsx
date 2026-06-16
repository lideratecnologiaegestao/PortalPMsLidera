'use client';

import { useId, useState } from 'react';
import { registrar, RegistroResposta, TIPOS_OUVIDORIA, TipoOuvidoria } from '../../lib/ouvidoria';

export default function OuvidoriaForm() {
  const idb = useId();
  const [tipo, setTipo] = useState<TipoOuvidoria>('reclamacao');
  const [anonima, setAnonima] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState<RegistroResposta | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim() || !descricao.trim()) {
      setErro('Preencha o assunto e a descrição.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const r = await registrar({
        canal: 'ouvidoria',
        tipo,
        assunto: assunto.trim(),
        descricao: descricao.trim(),
        anonima,
        solicitanteNome: anonima ? undefined : nome.trim() || undefined,
        solicitanteEmail: anonima ? undefined : email.trim() || undefined,
      });
      setOk(r);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao registrar.');
    } finally {
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <div className="space-y-4 rounded-lg border border-success/40 bg-success/5 p-5" role="alert">
        <h2 className="font-heading text-xl font-bold text-success">Manifestação registrada!</h2>
        <p className="text-sm">
          Guarde os dados abaixo para acompanhar sua manifestação. {anonima && (
            <strong>Como é anônima, a chave é a ÚNICA forma de acesso — anote-a.</strong>
          )}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-border bg-bg p-3">
            <dt className="text-xs text-fg/60">Protocolo</dt>
            <dd className="font-mono text-lg font-bold">{ok.protocolo}</dd>
          </div>
          <div className="rounded border border-border bg-bg p-3">
            <dt className="text-xs text-fg/60">Chave de acompanhamento</dt>
            <dd className="font-mono text-lg font-bold">{ok.chave}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/acompanhar?protocolo=${encodeURIComponent(ok.protocolo)}&chave=${encodeURIComponent(ok.chave)}`}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
          >
            Acompanhar agora
          </a>
          <button
            type="button"
            onClick={() => { setOk(null); setAssunto(''); setDescricao(''); }}
            className="rounded border border-border px-4 py-2 text-sm"
          >
            Nova manifestação
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}

      {/* Tipo */}
      <fieldset className="space-y-2">
        <legend className="font-semibold">Tipo de manifestação</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_OUVIDORIA.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer gap-2 rounded border p-3 text-sm ${
                tipo === t.value ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t.value}
                checked={tipo === t.value}
                onChange={() => setTipo(t.value)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">{t.label}</span>
                <span className="block text-xs text-fg/60">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Anonimato */}
      <label className="flex items-center gap-2 rounded border border-border p-3 text-sm">
        <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} />
        <span>
          <span className="font-semibold">Enviar de forma anônima</span>
          <span className="block text-xs text-fg/60">
            Não solicitaremos sua identificação. O acompanhamento será feito apenas pela chave.
          </span>
        </span>
      </label>

      {/* Identificação (oculta se anônima) */}
      {!anonima && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idb}-nome`} className="text-sm font-medium">Nome (opcional)</label>
            <input id={`${idb}-nome`} value={nome} onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" autoComplete="name" />
          </div>
          <div>
            <label htmlFor={`${idb}-email`} className="text-sm font-medium">E-mail (opcional)</label>
            <input id={`${idb}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" autoComplete="email" />
          </div>
        </div>
      )}

      <div>
        <label htmlFor={`${idb}-assunto`} className="text-sm font-medium">Assunto <span aria-hidden>*</span></label>
        <input id={`${idb}-assunto`} value={assunto} onChange={(e) => setAssunto(e.target.value)} required
          className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" maxLength={200} />
      </div>

      <div>
        <label htmlFor={`${idb}-desc`} className="text-sm font-medium">Descrição <span aria-hidden>*</span></label>
        <textarea id={`${idb}-desc`} value={descricao} onChange={(e) => setDescricao(e.target.value)} required
          rows={6} className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" maxLength={5000}
          placeholder="Descreva o ocorrido com o máximo de detalhes (local, data, envolvidos)…" />
      </div>

      <p className="text-xs text-fg/60">
        Prazo de resposta: até <strong>30 dias</strong>, prorrogável por mais 30 (Lei 13.460/2017).
        Seus dados são tratados conforme a <a href="/privacidade" className="underline">Política de Privacidade (LGPD)</a>.
      </p>

      <button type="submit" disabled={enviando}
        className="rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Registrar manifestação'}
      </button>
    </form>
  );
}
