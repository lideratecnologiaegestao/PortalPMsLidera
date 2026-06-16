'use client';

import { useId, useState } from 'react';
import { registrar, RegistroResposta } from '../../lib/ouvidoria';

export default function EsicForm() {
  const idb = useId();
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState<RegistroResposta | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim() || !descricao.trim()) {
      setErro('Informe o assunto e detalhe a informação solicitada.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      const r = await registrar({
        canal: 'esic',
        tipo: 'acesso_informacao',
        assunto: assunto.trim(),
        descricao: descricao.trim(),
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
        <h2 className="font-heading text-xl font-bold text-success">Pedido de acesso registrado!</h2>
        <p className="text-sm">Acompanhe seu pedido pelo painel ou pelo protocolo abaixo.</p>
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
          <a href={`/acompanhar?protocolo=${encodeURIComponent(ok.protocolo)}&chave=${encodeURIComponent(ok.chave)}`}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">
            Acompanhar agora
          </a>
          <a href="/cidadao" className="rounded border border-border px-4 py-2 text-sm">Ir para meu painel</a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {erro && <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{erro}</p>}
      <div>
        <label htmlFor={`${idb}-assunto`} className="text-sm font-medium">Assunto <span aria-hidden>*</span></label>
        <input id={`${idb}-assunto`} value={assunto} onChange={(e) => setAssunto(e.target.value)} required
          className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" maxLength={200}
          placeholder="Ex.: Cópia de contrato, despesas com…" />
      </div>
      <div>
        <label htmlFor={`${idb}-desc`} className="text-sm font-medium">Informação solicitada <span aria-hidden>*</span></label>
        <textarea id={`${idb}-desc`} value={descricao} onChange={(e) => setDescricao(e.target.value)} required
          rows={6} className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm" maxLength={5000}
          placeholder="Descreva de forma clara e específica qual informação pública você deseja receber." />
      </div>
      <p className="text-xs text-fg/60">
        Prazo de resposta: até <strong>20 dias</strong>, prorrogável por mais 10 (LAI 12.527/2011).
        O pedido de acesso à informação <strong>não pode ser anônimo</strong> (exige identificação por lei).
      </p>
      <button type="submit" disabled={enviando}
        className="rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Enviar pedido de acesso'}
      </button>
    </form>
  );
}
