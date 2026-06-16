'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  Conversa, Mensagem, UsuarioInterno,
  conectarSocket, criarConversa, definirAvatar, enviarAnexo, enviarMensagem,
  getConversas, getHistorico, getUsuarios, marcarLido, urlAnexo, urlAvatar,
} from '../../lib/chat';

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ userId, avatar, nome, online }: { userId?: string | null; avatar?: string | null; nome: string; online?: boolean }) {
  const src = avatar ?? (userId ? urlAvatar(userId) : null);
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
      ) : (
        nome.slice(0, 1).toUpperCase()
      )}
      {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-success" />}
    </span>
  );
}

export default function ChatWidget({ meuId }: { meuId: string }) {
  const [aberto, setAberto] = useState(false);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [telaNova, setTelaNova] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [erro, setErro] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const ativaRef = useRef<string | null>(null);
  ativaRef.current = ativaId;

  const totalNaoLidas = conversas.reduce((a, c) => a + c.naoLidas, 0);

  const recarregarConversas = useCallback(async () => {
    try {
      const cs = await getConversas();
      setConversas(cs);
      socketRef.current?.emit('entrar', cs.map((c) => c.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar conversas.');
    }
  }, []);

  // socket
  useEffect(() => {
    const s = conectarSocket();
    socketRef.current = s;
    s.on('connect', () => { getConversas().then((cs) => s.emit('entrar', cs.map((c) => c.id))).catch(() => {}); });
    s.on('mensagem', (m: Mensagem) => {
      if (m.conversaId === ativaRef.current) {
        setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        marcarLido(m.conversaId).catch(() => {});
      }
      setConversas((prev) => prev.map((c) =>
        c.id === m.conversaId
          ? { ...c, ultimaMensagem: { texto: m.conteudo || (m.anexos.length ? '📎 anexo' : ''), em: m.criadoEm },
              naoLidas: m.conversaId === ativaRef.current || m.autorId === meuId ? 0 : c.naoLidas + 1, atualizadoEm: m.criadoEm }
          : c).sort((a, b) => +new Date(b.atualizadoEm) - +new Date(a.atualizadoEm)));
    });
    s.on('presenca', ({ userId, online: on }: { userId: string; online: boolean }) =>
      setOnline((prev) => { const n = new Set(prev); on ? n.add(userId) : n.delete(userId); return n; }));
    s.on('typing', ({ conversaId, userId }: { conversaId: string; userId: string }) => {
      if (userId === meuId) return;
      setTyping((prev) => ({ ...prev, [conversaId]: Date.now() }));
    });
    s.on('excluida', ({ id }: { id: string }) =>
      setMensagens((prev) => prev.map((x) => (x.id === id ? { ...x, excluido: true, conteudo: null, anexos: [] } : x))));
    s.on('editada', (m: Mensagem) => setMensagens((prev) => prev.map((x) => (x.id === m.id ? m : x))));
    recarregarConversas();
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // abre conversa via evento externo (e-SIC "Discutir internamente")
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.conversaId as string | undefined;
      if (!id) return;
      setAberto(true);
      recarregarConversas().then(() => abrir(id));
    };
    window.addEventListener('abrir-chat', handler);
    return () => window.removeEventListener('abrir-chat', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens]);

  async function abrir(id: string) {
    setAtivaId(id);
    setTelaNova(false);
    try {
      const h = await getHistorico(id);
      setMensagens(h);
      await marcarLido(id);
      setConversas((prev) => prev.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha.'); }
  }

  async function enviar() {
    const v = texto.trim();
    if (!v || !ativaId) return;
    setTexto('');
    try {
      const m = await enviarMensagem(ativaId, v);
      setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao enviar.'); }
  }

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ativaId) return;
    try {
      const m = await enviarAnexo(ativaId, file);
      setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (err) { setErro(err instanceof Error ? err.message : 'Falha ao anexar.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  async function abrirNova() {
    setTelaNova(true);
    setAtivaId(null);
    try { setUsuarios(await getUsuarios()); } catch { /* */ }
  }

  async function iniciarDm(u: UsuarioInterno) {
    try {
      const { id } = await criarConversa({ tipo: 'dm', participantes: [u.id] });
      await recarregarConversas();
      abrir(id);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha.'); }
  }

  const ativa = conversas.find((c) => c.id === ativaId);
  const digitando = ativaId && typing[ativaId] && Date.now() - typing[ativaId] < 3000;

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Chat interno${totalNaoLidas ? `, ${totalNaoLidas} não lidas` : ''}`}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {totalNaoLidas > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-primary-fg">
            {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
          </span>
        )}
      </button>

      {/* Painel */}
      {aberto && (
        <div
          role="dialog" aria-label="Chat interno"
          onKeyDown={(e) => { if (e.key === 'Escape') setAberto(false); }}
          className="fixed bottom-24 right-5 z-40 flex h-[32rem] w-[22rem] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl"
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-primary px-3 py-2 text-primary-fg">
            {ativaId || telaNova ? (
              <button onClick={() => { setAtivaId(null); setTelaNova(false); }} className="text-sm" aria-label="Voltar">‹ Voltar</button>
            ) : <span className="font-heading text-sm font-bold">Chat interno</span>}
            <span className="truncate text-sm font-semibold">{ativa ? ativa.titulo : telaNova ? 'Nova conversa' : ''}</span>
            <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-lg leading-none">×</button>
          </div>

          {erro && <p className="bg-danger/10 px-3 py-1 text-xs text-danger">{erro}</p>}

          {/* Corpo */}
          {!ativaId && !telaNova && (
            <div className="flex-1 overflow-y-auto">
              <button onClick={abrirNova} className="w-full border-b border-border px-3 py-2 text-left text-sm font-semibold text-primary">+ Nova conversa</button>
              {conversas.length === 0 && <p className="p-4 text-sm text-fg/60">Nenhuma conversa ainda.</p>}
              {conversas.map((c) => (
                <button key={c.id} onClick={() => abrir(c.id)} className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/40">
                  <Avatar userId={c.tipo === 'dm' ? undefined : undefined} avatar={c.avatar} nome={c.titulo ?? '?'} online={c.online} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between">
                      <span className="truncate text-sm font-semibold">{c.titulo}{c.tipo === 'protocolo' && ' 🗂️'}</span>
                      <span className="ml-1 shrink-0 text-[10px] text-fg/50">{c.ultimaMensagem ? hora(c.ultimaMensagem.em) : ''}</span>
                    </span>
                    <span className="block truncate text-xs text-fg/60">{c.ultimaMensagem?.texto ?? 'Sem mensagens'}</span>
                  </span>
                  {c.naoLidas > 0 && <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg">{c.naoLidas}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Nova conversa: lista de usuários internos */}
          {telaNova && (
            <div className="flex-1 overflow-y-auto">
              <input placeholder="Buscar pessoa…" onChange={async (e) => setUsuarios(await getUsuarios(e.target.value))}
                className="m-2 w-[calc(100%-1rem)] rounded border border-border bg-bg px-2 py-1 text-sm" />
              {usuarios.filter((u) => u.id !== meuId).map((u) => (
                <button key={u.id} onClick={() => iniciarDm(u)} className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-muted/40">
                  <Avatar userId={u.id} avatar={u.avatar} nome={u.nome} online={u.online || online.has(u.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.nome}</span>
                    <span className="block text-xs text-fg/50">{u.role}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Thread */}
          {ativaId && (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {mensagens.map((m) => {
                  const meu = m.autorId === meuId;
                  return (
                    <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg p-2 text-sm ${meu ? 'rounded-br-none bg-primary/10' : 'rounded-bl-none border border-border bg-bg'}`}>
                        {!meu && <p className="text-[11px] font-semibold text-primary">{m.autorNome}</p>}
                        {m.excluido ? <p className="italic text-fg/40">mensagem removida</p> : (
                          <>
                            {m.conteudo && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                            {m.anexos.map((a) => (
                              <a key={a.idx} href={urlAnexo(m.id, a.idx)} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-primary underline">📎 {a.nome}</a>
                            ))}
                          </>
                        )}
                        <p className="mt-0.5 text-right text-[10px] text-fg/40">{hora(m.criadoEm)}{m.editado && ' · editada'}</p>
                      </div>
                    </div>
                  );
                })}
                {digitando && <p className="text-xs italic text-fg/50">digitando…</p>}
                <div ref={fimRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="flex items-center gap-1 border-t border-border p-2">
                <label className="cursor-pointer px-1 text-lg" aria-label="Anexar">📎
                  <input ref={fileRef} type="file" className="sr-only" onChange={anexar} accept="image/*,application/pdf,.doc,.docx" />
                </label>
                <input
                  value={texto}
                  onChange={(e) => { setTexto(e.target.value); socketRef.current?.emit('typing', { conversaId: ativaId }); }}
                  placeholder="Mensagem…"
                  className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-sm"
                />
                <button type="submit" disabled={!texto.trim()} className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg disabled:opacity-50">Enviar</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
