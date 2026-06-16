'use client';

/**
 * Widget de atendimento 24h para o cidadão.
 * Montado no layout público (app/layout.tsx).
 * Conecta ao namespace /atendimento com token JWT de visitante.
 * WCAG 2.1 AA, pt-BR, responsivo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  AtendimentoConfig,
  AtendStatusType,
  AutorTipo,
  MensagemAtend,
  conectarSocketAtendimento,
  enviarMensagemVisitante,
  getAtendimentoConfig,
  getMensagensVisitante,
  iniciarConversa,
  refreshTokenVisitante,
} from '../../lib/atendimento';
import EmojiPicker from '../ui/EmojiPicker';
import ChatMarkdown from './ChatMarkdown';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function labelStatus(status: AtendStatusType, agenteNome?: string | null): string {
  switch (status) {
    case 'bot': return 'Assistente virtual';
    case 'aguardando_agente': return 'Aguardando atendente…';
    case 'em_atendimento': return agenteNome ? `Atendente: ${agenteNome}` : 'Em atendimento';
    case 'encerrada': return 'Atendimento encerrado';
  }
}

function corBolha(autorTipo: AutorTipo, meuTipo: 'visitante'): string {
  if (autorTipo === meuTipo) return 'bg-primary text-primary-fg rounded-br-none ml-auto';
  if (autorTipo === 'bot') return 'bg-muted text-fg rounded-bl-none border border-border';
  if (autorTipo === 'agente') return 'bg-secondary/10 text-fg rounded-bl-none border border-secondary/20';
  return 'bg-muted/60 text-fg/60 italic text-xs rounded border border-border/40'; // sistema
}

// ─── Estado persistido em sessionStorage ────────────────────────────────────

interface SessaoAtend {
  id: string;
  token: string;
  criadaEm?: number; // epoch ms — para descartar token expirado (TTL 30min)
}

// Token de visitante expira em 30min; descartamos a sessão restaurada com folga.
const SESSAO_VALIDADE_MS = 29 * 60 * 1000;

function lerSessao(): SessaoAtend | null {
  try {
    const raw = sessionStorage.getItem('atend:sessao');
    if (!raw) return null;
    return JSON.parse(raw) as SessaoAtend;
  } catch {
    return null;
  }
}

function gravarSessao(s: SessaoAtend) {
  try {
    sessionStorage.setItem('atend:sessao', JSON.stringify(s));
  } catch { /* */ }
}

function limparSessao() {
  try { sessionStorage.removeItem('atend:sessao'); } catch { /* */ }
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AtendimentoWidget() {
  const [config, setConfig] = useState<AtendimentoConfig | null>(null);
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<'inicio' | 'chat'>('inicio');

  // Formulário de início
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [assunto, setAssunto] = useState('');
  const [lgpdAceito, setLgpdAceito] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  // Chat
  const [sessao, setSessao] = useState<SessaoAtend | null>(null);
  const [mensagens, setMensagens] = useState<MensagemAtend[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [statusAtend, setStatusAtend] = useState<AtendStatusType>('bot');
  const [agenteNome, setAgenteNome] = useState<string | null>(null);
  const [digitando, setDigitando] = useState(false);
  const [encerrada, setEncerrada] = useState(false);
  const [erro, setErro] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const sessaoRef = useRef<SessaoAtend | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Busca config na montagem ─────────────────────────────────────────────
  useEffect(() => {
    getAtendimentoConfig().then(setConfig).catch(() => {});
  }, []);

  // ── Restaura sessão existente (se ainda dentro da validade do token) ──────
  useEffect(() => {
    const s = lerSessao();
    if (!s) return;
    const expirada = !s.criadaEm || Date.now() - s.criadaEm > SESSAO_VALIDADE_MS;
    if (expirada) {
      limparSessao(); // token velho → começa do zero, sem erro na tela
      return;
    }
    setSessao(s);
    sessaoRef.current = s;
    setFase('chat');
  }, []);

  // ── Scroll automático ────────────────────────────────────────────────────
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, digitando]);

  // ── Foco ao abrir painel ─────────────────────────────────────────────────
  useEffect(() => {
    if (aberto) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  // ── ESC fecha ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [aberto]);

  // ── Conecta socket quando há sessão ──────────────────────────────────────
  const conectar = useCallback((s: SessaoAtend) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const socket = conectarSocketAtendimento(s.token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('entrar', { conversaId: s.id });
    });

    socket.on('atend:mensagem', (msg: MensagemAtend) => {
      // nunca renderiza internas no widget público
      if (msg.interno) return;
      setMensagens((prev) => {
        // já temos esta mensagem (idempotente contra ecos repetidos)
        if (prev.some((x) => x.id === msg.id)) return prev;
        // Reconcilia o eco da PRÓPRIA mensagem do visitante com a versão
        // otimista (id `opt-…`): substitui em vez de duplicar.
        if (msg.autorTipo === 'visitante') {
          const idx = prev.findIndex(
            (x) =>
              x.id.startsWith('opt-') &&
              x.autorTipo === 'visitante' &&
              x.conteudo === msg.conteudo,
          );
          if (idx !== -1) {
            const copia = prev.slice();
            copia[idx] = msg; // troca a otimista pela real (id definitivo)
            return copia;
          }
        }
        return [...prev, msg];
      });
    });

    socket.on('atend:status', (payload: { status: AtendStatusType; agenteNome?: string }) => {
      setStatusAtend(payload.status);
      if (payload.agenteNome) setAgenteNome(payload.agenteNome);
      if (payload.status === 'encerrada') setEncerrada(true);
    });

    socket.on('atend:typing', (payload: { autorTipo: AutorTipo }) => {
      if (payload.autorTipo === 'visitante') return;
      setDigitando(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setDigitando(false), 3000);
    });

    socket.on('atend:encerrada', (payload?: { mensagem?: string }) => {
      setEncerrada(true);
      const msgEnc = payload?.mensagem;
      if (msgEnc) {
        setMensagens((prev) => [
          ...prev,
          {
            id: `enc-${Date.now()}`,
            autorTipo: 'sistema' as const,
            conteudo: msgEnc,
            criadoEm: new Date().toISOString(),
          },
        ]);
      }
    });

    return socket;
  }, []);

  // ── Reinicia (sessão expirada/inválida): limpa e volta ao início ──────────
  const reiniciar = useCallback((msg?: string) => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    limparSessao();
    sessaoRef.current = null;
    setSessao(null);
    setMensagens([]);
    setEncerrada(false);
    setStatusAtend('bot');
    setAgenteNome(null);
    setFase('inicio');
    setErro(msg ?? '');
  }, []);

  // ── Carrega histórico da sessão ───────────────────────────────────────────
  const carregarHistorico = useCallback(async (s: SessaoAtend) => {
    try {
      const msgs = await getMensagensVisitante(s.id, s.token);
      setMensagens(msgs);
    } catch (e) {
      // Token expirado/inválido na restauração → recomeça limpo (sem erro feio)
      if ((e as { status?: number })?.status === 401) reiniciar();
    }
  }, [reiniciar]);

  // ── Quando sessão muda, conecta e carrega ─────────────────────────────────
  useEffect(() => {
    if (!sessao) return;
    sessaoRef.current = sessao;
    conectar(sessao);
    carregarHistorico(sessao);

    // Refresh de token a cada 25 min (TTL=30min)
    refreshTimerRef.current = setInterval(async () => {
      const s = sessaoRef.current;
      if (!s) return;
      try {
        const { token: novoToken } = await refreshTokenVisitante(s.id, s.token);
        const nova = { ...s, token: novoToken, criadaEm: Date.now() };
        sessaoRef.current = nova;
        setSessao(nova);
        gravarSessao(nova);
        // Reconecta socket com novo token
        conectar(nova);
      } catch { /* refresh falhou; o 401 no próximo uso reinicia a sessão */ }
    }, 25 * 60 * 1000);

    return () => {
      socketRef.current?.disconnect();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.id]);

  // ── Inicia conversa ───────────────────────────────────────────────────────
  async function iniciar(e: React.FormEvent) {
    e.preventDefault();
    if (config?.avisoLgpd && !lgpdAceito) return;
    setIniciando(true);
    setErro('');
    try {
      const result = await iniciarConversa({
        nome: nome.trim() || undefined,
        email: email.trim() || undefined,
        assunto: assunto.trim() || undefined,
        origemUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      const s: SessaoAtend = { id: result.id, token: result.token, criadaEm: Date.now() };
      gravarSessao(s);
      setSessao(s);
      sessaoRef.current = s;
      setStatusAtend(result.status);
      setFase('chat');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao iniciar atendimento.');
    } finally {
      setIniciando(false);
    }
  }

  // ── Envia mensagem ────────────────────────────────────────────────────────
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const v = texto.trim();
    if (!v || !sessaoRef.current || enviando) return;
    const s = sessaoRef.current;
    setTexto('');
    setEnviando(true);
    setErro('');

    // Mostra mensagem otimisticamente
    const otimista: MensagemAtend = {
      id: `opt-${Date.now()}`,
      autorTipo: 'visitante',
      conteudo: v,
      criadoEm: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, otimista]);

    try {
      await enviarMensagemVisitante(s.id, s.token, v);
    } catch (err) {
      // remove otimista em caso de erro
      setMensagens((prev) => prev.filter((m) => m.id !== otimista.id));
      if ((err as { status?: number })?.status === 401) {
        setTexto(v); // devolve o texto digitado
        reiniciar('Sua sessão expirou. Inicie um novo atendimento e reenvie sua mensagem.');
      } else {
        setErro(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
      }
    } finally {
      setEnviando(false);
    }
  }

  // ── Insere emoji na posicao do cursor ────────────────────────────────────
  function inserirEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setTexto((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? texto.length;
    const end = el.selectionEnd ?? texto.length;
    const next = texto.slice(0, start) + emoji + texto.slice(end);
    setTexto(next);
    // Reposiciona o cursor apos o emoji inserido
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // ── Nova conversa ─────────────────────────────────────────────────────────
  function novaConversa() {
    socketRef.current?.disconnect();
    limparSessao();
    setSessao(null);
    sessaoRef.current = null;
    setMensagens([]);
    setTexto('');
    setEncerrada(false);
    setStatusAtend('bot');
    setAgenteNome(null);
    setNome('');
    setEmail('');
    setAssunto('');
    setLgpdAceito(false);
    setFase('inicio');
  }

  // ── Não renderiza se atendimento inativo ──────────────────────────────────
  if (config === null) return null; // ainda carregando
  if (!config.ativo) return null;

  const expedienteHoje = config.expediente.filter((d) => d.ativo);

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? 'Fechar chat de atendimento' : 'Abrir chat de atendimento'}
        aria-expanded={aberto}
        aria-controls="atend-painel"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-opacity"
      >
        {aberto ? (
          <svg aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Painel */}
      {aberto && (
        <div
          id="atend-painel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Chat de atendimento ao cidadão"
          className="fixed bottom-24 right-5 z-50 flex w-[22rem] max-w-[calc(100vw-1.25rem)] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl sm:w-96"
          style={{ maxHeight: 'calc(100dvh - 7rem)' }}
        >
          {/* Cabeçalho */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-primary px-3 py-2.5 text-primary-fg">
            <div className="min-w-0">
              <p className="font-heading text-sm font-bold leading-tight">Fale Conosco</p>
              {fase === 'chat' && (
                <p className="truncate text-xs opacity-90">
                  {labelStatus(statusAtend, agenteNome)}
                </p>
              )}
            </div>
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar chat"
              className="shrink-0 rounded p-1 hover:bg-primary-fg/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg"
            >
              <svg aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Erro global */}
          {erro && (
            <p role="alert" className="shrink-0 bg-danger/10 px-3 py-1.5 text-xs text-danger">
              {erro}
            </p>
          )}

          {/* ── Fase: início ─────────────────────────────────────────────── */}
          {fase === 'inicio' && (
            <div className="flex-1 overflow-y-auto">
              {/* Saudação */}
              <div className="border-b border-border/50 bg-muted/40 px-4 py-3">
                <p className="text-sm text-fg">
                  {config.saudacao ?? 'Olá! Como podemos ajudá-lo hoje?'}
                </p>
                {expedienteHoje.length > 0 && (
                  <p className="mt-1 text-xs text-fg/60">
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full ${config.dentroExpediente ? 'bg-success' : 'bg-warning'}`} aria-hidden="true" />
                    {config.dentroExpediente ? 'Atendimento disponível agora' : 'Fora do horário de atendimento'}
                    {' — '}
                    {expedienteHoje.map((d, i) => (
                      <span key={d.diaSemana}>
                        {i > 0 && ', '}
                        {DIAS_SEMANA[d.diaSemana]} {d.horaInicio}–{d.horaFim}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {/* Formulário */}
              <form onSubmit={iniciar} className="space-y-3 p-4">
                <div>
                  <label htmlFor="atend-nome" className="block text-xs font-semibold text-fg mb-0.5">
                    Seu nome <span className="font-normal text-fg/50">(opcional)</span>
                  </label>
                  <input
                    id="atend-nome"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome completo"
                    autoComplete="name"
                    className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="atend-email" className="block text-xs font-semibold text-fg mb-0.5">
                    E-mail <span className="font-normal text-fg/50">(opcional)</span>
                  </label>
                  <input
                    id="atend-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    autoComplete="email"
                    className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label htmlFor="atend-assunto" className="block text-xs font-semibold text-fg mb-0.5">
                    Assunto <span className="font-normal text-fg/50">(opcional)</span>
                  </label>
                  <input
                    id="atend-assunto"
                    type="text"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    placeholder="Sobre o que você precisa de ajuda?"
                    className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Aviso LGPD */}
                {config.avisoLgpd && (
                  <div className="rounded border border-border/50 bg-muted/30 p-2">
                    <p className="mb-1.5 text-xs text-fg/70">{config.avisoLgpd}</p>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={lgpdAceito}
                        onChange={(e) => setLgpdAceito(e.target.checked)}
                        required
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                      />
                      <span>Li e aceito o uso dos meus dados para fins de atendimento.</span>
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={iniciando || (!!config.avisoLgpd && !lgpdAceito)}
                  className="w-full rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {iniciando ? 'Iniciando…' : 'Iniciar atendimento'}
                </button>
              </form>
            </div>
          )}

          {/* ── Fase: chat ────────────────────────────────────────────────── */}
          {fase === 'chat' && (
            <>
              {/* Histórico de mensagens */}
              <div
                className="flex-1 space-y-2 overflow-y-auto p-3"
                aria-live="polite"
                aria-atomic="false"
                aria-label="Mensagens do atendimento"
              >
                {mensagens.length === 0 && (
                  <p className="py-4 text-center text-sm text-fg/50">
                    {config.saudacao ?? 'Aguardando…'}
                  </p>
                )}
                {mensagens.map((m) => {
                  const ehVisitante = m.autorTipo === 'visitante';
                  return (
                    <div
                      key={m.id}
                      className={`flex ${ehVisitante ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${corBolha(m.autorTipo, 'visitante')}`}
                      >
                        {!ehVisitante && m.autorTipo !== 'sistema' && (
                          <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                            {m.autorTipo === 'bot' ? 'Assistente' : m.autorNome ?? 'Atendente'}
                          </p>
                        )}
                        {ehVisitante ? (
                          // Mensagem do visitante: texto puro (não interpreta Markdown digitado).
                          <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                        ) : (
                          // Bot/atendente/sistema: renderiza Markdown (negrito, listas, tabelas, links).
                          <ChatMarkdown>{m.conteudo}</ChatMarkdown>
                        )}
                        <p className={`mt-0.5 text-right text-[10px] ${ehVisitante ? 'opacity-70' : 'text-fg/40'}`}>
                          {hora(m.criadoEm)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {digitando && (
                  <p className="text-xs italic text-fg/50" aria-live="polite">
                    Atendente está digitando…
                  </p>
                )}
                <div ref={fimRef} />
              </div>

              {/* Encerrada: opção de nova conversa */}
              {encerrada ? (
                <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-3 text-center">
                  <p className="mb-2 text-xs text-fg/70">
                    Este atendimento foi encerrado.
                  </p>
                  <button
                    onClick={novaConversa}
                    className="rounded bg-primary px-4 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Iniciar novo atendimento
                  </button>
                </div>
              ) : (
                /* Composer */
                <form
                  onSubmit={enviar}
                  className="shrink-0 flex items-center gap-1.5 border-t border-border p-2"
                >
                  <EmojiPicker onSelect={inserirEmoji} disabled={enviando} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Digite sua mensagem…"
                    disabled={enviando}
                    aria-label="Mensagem"
                    className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!texto.trim() || enviando}
                    aria-label="Enviar mensagem"
                    className="shrink-0 rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg disabled:opacity-50 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                    <span className="sr-only">Enviar</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
