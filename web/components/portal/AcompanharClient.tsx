'use client';

import { useEffect, useState } from 'react';
import { abrirRecurso, acompanhar, avaliar, recuperarProtocolos, Detalhe, STATUS_LABEL } from '../../lib/ouvidoria';
import Tramitacao from './Tramitacao';

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function Avaliacao({ protocolo, chave, jaAvaliou }: { protocolo: string; chave?: string; jaAvaliou: boolean }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviado, setEnviado] = useState(jaAvaliou);
  const [erro, setErro] = useState('');

  if (enviado) {
    return (
      <p className="rounded border border-success/40 bg-success/5 p-3 text-sm text-success">
        Obrigado por avaliar o atendimento da ouvidoria!
      </p>
    );
  }

  async function enviar() {
    if (!nota) { setErro('Escolha uma nota de 1 a 5.'); return; }
    try {
      await avaliar(protocolo, nota, comentario.trim() || undefined, chave);
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao avaliar.');
    }
  }

  return (
    <div className="space-y-2 rounded border border-border p-4">
      <h3 className="font-semibold">Avalie o atendimento</h3>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      <div className="flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setNota(n)}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`} aria-pressed={nota >= n}
            className={`text-2xl ${nota >= n ? 'text-warning' : 'text-fg/30'}`}>★</button>
        ))}
      </div>
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2}
        placeholder="Comentário (opcional)" className="w-full rounded border border-border bg-bg p-2 text-sm" />
      <button type="button" onClick={enviar} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">
        Enviar avaliação
      </button>
    </div>
  );
}

function Recurso({ protocolo, chave, onAtualizado }: { protocolo: string; chave?: string; onAtualizado: (d: Detalhe) => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!texto.trim()) { setErro('Descreva a justificativa do recurso.'); return; }
    setEnviando(true); setErro('');
    try {
      const d = await abrirRecurso(protocolo, texto.trim(), chave);
      onAtualizado(d);
      setAberto(false);
      setTexto('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir recurso.');
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="rounded border border-border p-4">
        <p className="text-sm text-fg/80">
          Não concorda com a resposta? Você pode interpor um <strong>recurso</strong> (LAI).
        </p>
        <button type="button" onClick={() => setAberto(true)}
          className="mt-2 rounded border border-primary px-4 py-2 text-sm font-semibold text-primary">
          Abrir recurso
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-primary/40 bg-primary/5 p-4">
      <h3 className="font-semibold">Recurso (Acesso à Informação)</h3>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
        placeholder="Explique por que está recorrendo da resposta…" maxLength={5000}
        className="w-full rounded border border-border bg-bg p-2 text-sm" />
      <div className="flex gap-2">
        <button type="button" onClick={enviar} disabled={enviando}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
          {enviando ? 'Enviando…' : 'Enviar recurso'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded border border-border px-4 py-2 text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Seção "Esqueci meu protocolo" — envia e-mail via API (LGPD: nunca lista na tela). */
function EsqueciProtocolo() {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setErro('Informe seu endereço de e-mail.');
      return;
    }
    setEnviando(true);
    setErro('');
    setMensagem('');
    try {
      const res = await recuperarProtocolos(email.trim());
      // A API sempre responde ok:true + mensagem genérica (LGPD)
      setMensagem(
        res.mensagem ||
          'Se houver manifestações vinculadas a este e-mail, você receberá a lista em instantes.',
      );
    } catch {
      // Inclusive rate-limit: mensagem genérica — não revela se o e-mail existe
      setMensagem(
        'Se houver manifestações vinculadas a este e-mail, você receberá a lista em instantes.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded border border-border">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="esqueci-protocolo-painel"
        onClick={() => { setAberto((v) => !v); setMensagem(''); setErro(''); }}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span>Esqueci meu protocolo</span>
        <span aria-hidden="true" className="text-lg leading-none">{aberto ? '−' : '+'}</span>
      </button>

      {aberto && (
        <div id="esqueci-protocolo-painel" className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <p className="text-sm text-fg/70">
            Informe o e-mail usado no registro. Enviaremos a lista de protocolos
            vinculados a ele — sem exibir nada nesta tela.
          </p>

          {mensagem ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded border border-success/40 bg-success/5 p-3 text-sm text-success"
            >
              {mensagem}
            </p>
          ) : (
            <form onSubmit={enviar} className="flex flex-wrap items-end gap-3" noValidate>
              <div className="flex-1 min-w-56">
                <label htmlFor="esqueci-email" className="text-sm font-medium">
                  E-mail do registro
                </label>
                <input
                  id="esqueci-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  aria-required="true"
                  aria-describedby={erro ? 'esqueci-email-erro' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="mt-1 block w-full rounded border border-border bg-bg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {erro && (
                  <p id="esqueci-email-erro" role="alert" className="mt-1 text-xs text-danger">
                    {erro}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={enviando}
                className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {enviando ? 'Enviando…' : 'Enviar meus protocolos por e-mail'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function AcompanharClient({
  protocoloInicial,
  chaveInicial,
}: {
  protocoloInicial?: string;
  chaveInicial?: string;
}) {
  const [protocolo, setProtocolo] = useState(protocoloInicial ?? '');
  const [chave, setChave] = useState(chaveInicial ?? '');
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  async function consultar(p = protocolo, c = chave) {
    if (!p.trim()) { setErro('Informe o protocolo.'); return; }
    setLoading(true);
    setErro('');
    try {
      const d = await acompanhar(p.trim(), c.trim() || undefined);
      setDetalhe(d);
    } catch (e) {
      setDetalhe(null);
      setErro(e instanceof Error ? e.message : 'Não foi possível consultar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (protocoloInicial) consultar(protocoloInicial, chaveInicial ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Consulta */}
      <form
        onSubmit={(e) => { e.preventDefault(); consultar(); }}
        className="flex flex-wrap items-end gap-3 rounded border border-border p-4"
      >
        <div>
          <label htmlFor="ac-protocolo" className="text-sm font-medium">Protocolo</label>
          <input id="ac-protocolo" value={protocolo} onChange={(e) => setProtocolo(e.target.value)}
            className="mt-1 block rounded border border-border bg-bg p-2 text-sm font-mono" placeholder="2026000123" />
        </div>
        <div>
          <label htmlFor="ac-chave" className="text-sm font-medium">Chave</label>
          <input id="ac-chave" value={chave} onChange={(e) => setChave(e.target.value)}
            className="mt-1 block rounded border border-border bg-bg p-2 text-sm font-mono" placeholder="ABCDE-FGHJK" />
        </div>
        <button type="submit" disabled={loading}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {erro && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {erro}
        </p>
      )}

      {/* Recuperação de protocolo por e-mail (LGPD: resposta genérica, nunca lista na tela) */}
      <EsqueciProtocolo />

      {detalhe && (
        <div className="space-y-6">
          {/* Cabeçalho de status */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-fg/60">Protocolo</p>
                <p className="font-mono text-lg font-bold">{detalhe.protocolo}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                {STATUS_LABEL[detalhe.status] ?? detalhe.status}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-fg/60">Canal</dt><dd>{detalhe.canal === 'esic' ? 'e-SIC' : 'Ouvidoria'}</dd></div>
              <div><dt className="text-fg/60">Assunto</dt><dd>{detalhe.assunto}</dd></div>
              <div>
                <dt className="text-fg/60">Prazo de resposta</dt>
                <dd>{dataCurta(detalhe.prazoEm)}{detalhe.prorrogado ? ' (prorrogado)' : ''}</dd>
              </div>
            </dl>
          </div>

          {/* Resposta oficial em destaque, quando houver */}
          {detalhe.resposta && (
            <div className="rounded-lg border border-success/40 bg-success/5 p-4">
              <h2 className="font-heading text-lg font-bold text-success">Resposta da Ouvidoria</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{detalhe.resposta}</p>
            </div>
          )}

          {/* Chat de tramitação */}
          <Tramitacao
            key={`${detalhe.status}-${detalhe.mensagens.length}-${detalhe.anexos.length}`}
            inicial={detalhe}
            protocolo={detalhe.protocolo}
            chave={chave.trim() || undefined}
          />

          {/* Recurso (e-SIC) */}
          {detalhe.recursoDisponivel && (
            <Recurso protocolo={detalhe.protocolo} chave={chave.trim() || undefined} onAtualizado={setDetalhe} />
          )}

          {/* Avaliação */}
          {(detalhe.podeAvaliar || detalhe.satisfacao) && (
            <Avaliacao protocolo={detalhe.protocolo} chave={chave.trim() || undefined} jaAvaliou={!!detalhe.satisfacao} />
          )}
        </div>
      )}
    </div>
  );
}
