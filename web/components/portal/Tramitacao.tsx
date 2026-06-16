'use client';

import { useRef, useState } from 'react';
import { anexar, Detalhe, enviarMensagem, STATUS_LABEL, urlAnexo } from '../../lib/ouvidoria';

const EVENTO_LABEL: Record<string, string> = {
  registrar: 'Manifestação registrada',
  iniciar_analise: 'Triagem iniciada',
  encaminhar_area: 'Encaminhada à área responsável',
  solicitar_complemento: 'Complemento solicitado ao cidadão',
  retomar: 'Tramitação retomada',
  prorrogar: 'Prazo prorrogado',
  responder: 'Resposta publicada',
  indeferir: 'Pedido indeferido',
  atender_parcial: 'Atendido parcialmente',
  abrir_recurso_1a: 'Recurso de 1ª instância aberto',
  abrir_recurso_2a: 'Recurso de 2ª instância aberto',
  concluir: 'Manifestação concluída',
  arquivar: 'Manifestação arquivada',
};

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

type Item =
  | { kind: 'msg'; ts: number; id: string; autorTipo: string; autorNome: string; conteudo: string }
  | { kind: 'evt'; ts: number; id: string; label: string; status: string };

/**
 * Chat de tramitação do cidadão: descrição inicial + mensagens (cidadão/ouvidor)
 * intercaladas com os marcos de status, em ordem cronológica. Inclui caixa de
 * resposta (quando a manifestação ainda está aberta).
 */
export default function Tramitacao({
  inicial,
  protocolo,
  chave,
}: {
  inicial: Detalhe;
  protocolo: string;
  chave?: string;
}) {
  const [detalhe, setDetalhe] = useState<Detalhe>(inicial);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [anexando, setAnexando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const encerrada = ['concluida', 'arquivada'].includes(detalhe.status);

  async function handleAnexar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnexando(true);
    setErro('');
    try {
      const atualizado = await anexar(protocolo, file, chave);
      setDetalhe(atualizado);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao anexar.');
    } finally {
      setAnexando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const itens: Item[] = [
    ...detalhe.mensagens.map((m) => ({
      kind: 'msg' as const,
      ts: new Date(m.criadoEm).getTime(),
      id: m.id,
      autorTipo: m.autorTipo,
      autorNome: m.autorNome,
      conteudo: m.conteudo,
    })),
    ...detalhe.eventos
      .filter((e) => e.evento !== 'registrar')
      .map((e) => ({
        kind: 'evt' as const,
        ts: new Date(e.criadoEm).getTime(),
        id: `e${e.id}`,
        label: EVENTO_LABEL[e.evento] ?? e.evento,
        status: e.paraStatus,
      })),
  ].sort((a, b) => a.ts - b.ts);

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    const v = texto.trim();
    if (!v) return;
    setEnviando(true);
    setErro('');
    try {
      const atualizado = await enviarMensagem(protocolo, v, chave);
      setDetalhe(atualizado);
      setTexto('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-bold">Acompanhamento da tramitação</h2>

      <ol className="space-y-3" aria-label="Linha do tempo da manifestação">
        {/* Abertura: a descrição enviada pelo cidadão */}
        <li className="flex justify-end">
          <div className="max-w-[80%] rounded-lg rounded-br-none bg-primary/10 p-3">
            <p className="text-xs font-semibold text-primary">Você · {dataHora(detalhe.criadoEm)}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{detalhe.descricao}</p>
          </div>
        </li>

        {itens.map((it) =>
          it.kind === 'evt' ? (
            <li key={it.id} className="flex justify-center">
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-fg/70">
                {it.label} · {STATUS_LABEL[it.status] ?? it.status}
              </span>
            </li>
          ) : (
            <li
              key={it.id}
              className={`flex ${it.autorTipo === 'cidadao' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  it.autorTipo === 'cidadao'
                    ? 'rounded-br-none bg-primary/10'
                    : 'rounded-bl-none border border-border bg-bg'
                }`}
              >
                <p
                  className={`text-xs font-semibold ${
                    it.autorTipo === 'cidadao' ? 'text-primary' : 'text-fg/70'
                  }`}
                >
                  {it.autorNome} · {dataHora(new Date(it.ts).toISOString())}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{it.conteudo}</p>
              </div>
            </li>
          ),
        )}
      </ol>

      {/* Anexos */}
      {detalhe.anexos.length > 0 && (
        <div className="rounded border border-border p-3">
          <p className="mb-2 text-sm font-medium">Anexos</p>
          <ul className="space-y-1">
            {detalhe.anexos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  📎 {a.nomeArquivo}
                  <span className="ml-1 text-xs text-fg/50">
                    ({a.origem === 'orgao' ? 'órgão' : 'cidadão'})
                  </span>
                </span>
                <a href={urlAnexo(protocolo, a.id, chave)} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-primary underline">Baixar</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">{erro}</p>
      )}

      {encerrada ? (
        <p className="rounded border border-border bg-muted/40 p-3 text-sm text-fg/70">
          Esta manifestação foi encerrada. Não é possível enviar novas mensagens.
        </p>
      ) : (
        <form onSubmit={handleEnviar} className="space-y-2">
          <label htmlFor="msg-cidadao" className="text-sm font-medium">
            Adicionar mensagem ou complemento
          </label>
          <textarea
            id="msg-cidadao"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full rounded border border-border bg-bg p-2 text-sm"
            placeholder="Escreva aqui para complementar ou responder à ouvidoria…"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar mensagem'}
            </button>
            <label className="cursor-pointer text-sm text-primary underline">
              {anexando ? 'Anexando…' : '📎 Anexar arquivo'}
              <input ref={fileRef} type="file" className="sr-only" onChange={handleAnexar}
                accept="image/*,application/pdf,.doc,.docx" disabled={anexando} />
            </label>
            <span className="text-xs text-fg/50">Imagem, PDF ou documento (até 15 MB)</span>
          </div>
        </form>
      )}
    </div>
  );
}
