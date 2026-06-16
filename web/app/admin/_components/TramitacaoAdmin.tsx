'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError, Pagina, adminGet, adminPost, qs } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { abrirProtocolo } from '../../../lib/chat';
import { ui } from './ui';

interface Msg {
  id: string;
  autorTipo: string;
  autorNome: string | null;
  conteudo: string;
  interno: boolean;
  criadoEm: string;
}
interface Evt {
  id: string;
  evento: string;
  paraStatus: string;
  observacao: string | null;
  criadoEm: string;
}
interface Anexo {
  id: string;
  nomeArquivo: string;
  mime: string;
  origem: string;
  tamanhoBytes: number;
  criadoEm: string;
}
interface Tram { mensagens: Msg[]; eventos: Evt[]; anexos: Anexo[] }
interface Opt { id: string; nome: string }

function dh(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Tramitação no painel interno (ouvidor / área): chat completo (inclui mensagens
 * internas ouvidor↔área), envio de mensagem (interna ou ao cidadão), resposta
 * oficial (encerra SLA) e encaminhamento à área com seletores de secretaria e
 * responsável.
 */
export default function TramitacaoAdmin({ id, onAtualizar }: { id: string; onAtualizar: () => void }) {
  const [tram, setTram] = useState<Tram | null>(null);
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // encaminhamento
  const [abrirEnc, setAbrirEnc] = useState(false);
  const [secretarias, setSecretarias] = useState<Opt[]>([]);
  const [usuarios, setUsuarios] = useState<Opt[]>([]);
  const [secId, setSecId] = useState('');
  const [respId, setRespId] = useState('');

  const carregar = useCallback(async () => {
    try {
      const t = await adminGet<Tram>(`/api/admin/manifestacoes/${id}/tramitacao`);
      setTram(t);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar tramitação.');
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function carregarOpcoes() {
    if (secretarias.length || usuarios.length) return;
    try {
      const [s, u] = await Promise.all([
        adminGet<Pagina<Opt>>(`/api/admin/secretarias${qs({ pageSize: 100 })}`),
        adminGet<Pagina<Opt>>(`/api/admin/users${qs({ pageSize: 100 })}`),
      ]);
      setSecretarias(s.items);
      setUsuarios(u.items);
    } catch {
      /* silencioso — selects ficam vazios */
    }
  }

  async function acao(fn: () => Promise<unknown>) {
    setBusy(true);
    setErro('');
    try {
      await fn();
      setTexto('');
      await carregar();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha na ação.');
    } finally {
      setBusy(false);
    }
  }

  async function anexarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErro('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${apiBase}/api/admin/manifestacoes/${id}/anexo`, {
        method: 'POST', credentials: 'include', body: form,
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao anexar.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const enviarMensagem = () =>
    acao(() => adminPost(`/api/admin/manifestacoes/${id}/mensagem`, { conteudo: texto, interno }));
  const responder = () =>
    acao(() => adminPost(`/api/admin/manifestacoes/${id}/responder`, { conteudo: texto }));
  const encaminhar = () =>
    acao(async () => {
      await adminPost(`/api/admin/manifestacoes/${id}/encaminhar`, {
        secretariaId: secId || undefined,
        responsavelId: respId || undefined,
        observacao: texto || undefined,
      });
      setAbrirEnc(false);
    });

  // linha do tempo: mensagens + eventos
  const itens = tram
    ? [
        ...tram.mensagens.map((m) => ({ ts: new Date(m.criadoEm).getTime(), tipo: 'msg' as const, m })),
        ...tram.eventos
          .filter((e) => e.evento !== 'registrar')
          .map((e) => ({ ts: new Date(e.criadoEm).getTime(), tipo: 'evt' as const, e })),
      ].sort((a, b) => a.ts - b.ts)
    : [];

  return (
    <section aria-label="Tramitação" className="space-y-3">
      <h3 className="font-semibold">Tramitação</h3>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}

      <ol className="max-h-72 space-y-2 overflow-y-auto rounded border border-border p-2">
        {itens.length === 0 && <li className="p-2 text-sm text-fg/60">Sem mensagens ainda.</li>}
        {itens.map((it, i) =>
          it.tipo === 'evt' ? (
            <li key={`e${i}`} className="text-center">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg/70">
                {it.e.evento.replace(/_/g, ' ')} → {it.e.paraStatus.replace(/_/g, ' ')}
              </span>
            </li>
          ) : (
            <li
              key={`m${i}`}
              className={`rounded p-2 text-sm ${
                it.m.interno
                  ? 'border border-warning/40 bg-warning/10'
                  : it.m.autorTipo === 'cidadao'
                  ? 'bg-muted/60'
                  : 'bg-primary/10'
              }`}
            >
              <p className="text-xs font-semibold">
                {it.m.autorTipo === 'cidadao' ? 'Cidadão' : it.m.autorNome ?? 'Ouvidoria'}
                {it.m.interno && <span className="ml-1 text-warning">· interna</span>}
                <span className="ml-1 font-normal text-fg/50">{dh(it.m.criadoEm)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{it.m.conteudo}</p>
            </li>
          ),
        )}
      </ol>

      {/* Anexos */}
      {tram && tram.anexos.length > 0 && (
        <div className="rounded border border-border p-2">
          <p className="mb-1 text-xs font-semibold text-fg/70">Anexos</p>
          <ul className="space-y-1">
            {tram.anexos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">📎 {a.nomeArquivo} <span className="text-xs text-fg/50">({a.origem})</span></span>
                <a href={`${apiBase}/api/admin/manifestacoes/anexo/${a.id}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-primary underline">Baixar</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Caixa de resposta */}
      <textarea
        className={`${ui.input} min-h-[70px] resize-y`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva uma mensagem, resposta ao cidadão ou observação de encaminhamento…"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
        Mensagem interna (ouvidor ↔ área — não visível ao cidadão)
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ui.btnGhost} disabled={busy || !texto.trim()} onClick={enviarMensagem}>
          {interno ? 'Enviar (interna)' : 'Enviar ao cidadão'}
        </button>
        <button type="button" className={ui.btn} disabled={busy || !texto.trim()} onClick={responder}>
          Responder e encerrar prazo
        </button>
        <button
          type="button"
          className={ui.btnGhost}
          onClick={() => { setAbrirEnc((v) => !v); carregarOpcoes(); }}
        >
          Encaminhar à área
        </button>
        <label className="cursor-pointer self-center text-sm text-primary underline">
          📎 Anexar
          <input ref={fileRef} type="file" className="sr-only" onChange={anexarArquivo}
            accept="image/*,application/pdf,.doc,.docx" disabled={busy} />
        </label>
        <button
          type="button"
          className={ui.btnGhost}
          title="Abrir conversa interna (entre servidores) vinculada a este protocolo"
          onClick={async () => {
            try {
              const c = await abrirProtocolo(id);
              window.dispatchEvent(new CustomEvent('abrir-chat', { detail: { conversaId: c.id } }));
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Falha ao abrir o chat.');
            }
          }}
        >
          💬 Discutir internamente
        </button>
      </div>

      {abrirEnc && (
        <div className="space-y-2 rounded border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="enc-sec" className={ui.label}>Secretaria</label>
              <select id="enc-sec" className={ui.input} value={secId} onChange={(e) => setSecId(e.target.value)}>
                <option value="">—</option>
                {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="enc-resp" className={ui.label}>Responsável</label>
              <select id="enc-resp" className={ui.input} value={respId} onChange={(e) => setRespId(e.target.value)}>
                <option value="">—</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-fg/60">
            A observação acima vira uma mensagem interna para a área. O responsável vê o caso em “Minhas atribuições”.
          </p>
          <button type="button" className={ui.btn} disabled={busy} onClick={encaminhar}>
            Confirmar encaminhamento
          </button>
        </div>
      )}
    </section>
  );
}
