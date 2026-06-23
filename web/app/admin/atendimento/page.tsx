'use client';

/**
 * Console admin do Atendimento Omnichannel — caixa de entrada unificada.
 * Roles permitidos: OUVIDOR, SERVIDOR, ADMIN_PREFEITURA (verificado no backend).
 * Tempo real: socket /atendimento com cookie de sessão.
 * WCAG 2.1 AA, pt-BR.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  AtendStatusType,
  CanalTipo,
  ConversaDetalhe,
  ConversaLista,
  AtendimentoTag,
  MensagemAtend,
  conectarSocketAtendimentoAdmin,
} from '../../../lib/atendimento';
import { AdminApiError, adminGet, adminPatch, adminPost, qs } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { useSessaoAdmin } from '../../../lib/session-context';
import { podeVerOuvidoria } from '../../../lib/roles';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import EmojiPicker from '../../../components/ui/EmojiPicker';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_LABEL: Record<AtendStatusType, string> = {
  bot: 'Bot',
  aguardando_agente: 'Aguardando',
  em_atendimento: 'Em atendimento',
  encerrada: 'Encerrada',
};
const STATUS_COR: Record<AtendStatusType, string> = {
  bot: 'bg-muted text-fg',
  aguardando_agente: 'bg-warning/20 text-warning',
  em_atendimento: 'bg-success/20 text-success',
  encerrada: 'bg-border text-fg/50',
};
const CANAL_LABEL: Record<CanalTipo, string> = {
  widget: 'Widget',
  whatsapp: 'WhatsApp',
};

function Badge({ status }: { status: AtendStatusType }) {
  return (
    <span className={`${ui.badge} ${STATUS_COR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function CanalBadge({ canal }: { canal: CanalTipo }) {
  return (
    <span className={`${ui.badge} ${canal === 'whatsapp' ? 'bg-success/20 text-success' : 'bg-secondary/10 text-secondary'}`}>
      {CANAL_LABEL[canal]}
    </span>
  );
}

function TagChip({ nome, cor }: { nome: string; cor: string }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: cor || '#888' }}
    >
      {nome}
    </span>
  );
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface Filtros {
  status: string;
  canal: string;
  secretariaId: string;
  tagId: string;
  q: string;
  page: number;
}

interface AgenteLista {
  id: string;
  nome: string;
  role: string;
}

interface SecretariaLista {
  id: string;
  nome: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AtendimentoAdminPage() {
  const sessao = useSessaoAdmin();
  const [conversas, setConversas] = useState<ConversaLista[]>([]);
  const [total, setTotal] = useState(0);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ConversaDetalhe | null>(null);
  const [tags, setTags] = useState<AtendimentoTag[]>([]);
  const [agentes, setAgentes] = useState<AgenteLista[]>([]);
  const [secretarias, setSecretarias] = useState<SecretariaLista[]>([]);

  const [filtros, setFiltros] = useState<Filtros>({
    status: '',
    canal: '',
    secretariaId: '',
    tagId: '',
    q: '',
    page: 1,
  });

  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  // Modais
  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalTransferir, setModalTransferir] = useState(false);
  const [modalEncerrar, setModalEncerrar] = useState(false);
  const [modalTags, setModalTags] = useState(false);
  const [msgEncerramento, setMsgEncerramento] = useState('');
  const [agenteIdAtribuir, setAgenteIdAtribuir] = useState('');
  const [secretariaIdTransferir, setSecretariaIdTransferir] = useState('');
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const selecionadaRef = useRef<string | null>(null);
  selecionadaRef.current = selecionadaId;
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll automático ──────────────────────────────────────────────────────
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detalhe?.mensagens]);

  // ── Carrega dados auxiliares ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      adminGet<AtendimentoTag[]>('/api/admin/atendimento/tags').catch(() => []),
      adminGet<AgenteLista[]>('/api/admin/usuarios?role=ouvidor,servidor,admin_prefeitura&pageSize=200').catch(() => []),
      adminGet<SecretariaLista[]>('/api/secretarias').catch(() => []),
    ]).then(([t, a, s]) => {
      setTags(t as AtendimentoTag[]);
      // A API de usuários pode devolver {items:[…]} ou [...]
      const arr = Array.isArray(a) ? a : ((a as unknown as { items: AgenteLista[] })?.items ?? []);
      setAgentes(arr);
      setSecretarias(s as SecretariaLista[]);
    });
  }, []);

  // ── Carrega lista de conversas ────────────────────────────────────────────
  const carregarLista = useCallback(async (f: Filtros) => {
    setCarregandoLista(true);
    try {
      const params: Record<string, string | number | undefined> = {
        status: f.status || undefined,
        canal: f.canal || undefined,
        secretariaId: f.secretariaId || undefined,
        tagId: f.tagId || undefined,
        q: f.q || undefined,
        page: f.page,
      };
      const res = await adminGet<{ total: number; items: ConversaLista[] }>(
        `/api/admin/atendimento/conversas${qs(params)}`,
      );
      setConversas(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar conversas.');
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => {
    carregarLista(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  // ── Socket admin ──────────────────────────────────────────────────────────
  useEffect(() => {
    const s = conectarSocketAtendimentoAdmin();
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('entrar_tenant');
    });

    s.on('atend:nova_conversa', (_payload: unknown) => {
      // Insere no topo e recarrega a lista para manter filtros
      setFiltros((f) => ({ ...f, page: 1 }));
    });

    s.on('atend:mensagem', (msg: MensagemAtend & { conversaId?: string }) => {
      const convId = msg.conversaId;
      if (convId && convId === selecionadaRef.current) {
        setDetalhe((prev) => {
          if (!prev) return prev;
          const jaExiste = prev.mensagens.some((m) => m.id === msg.id);
          if (jaExiste) return prev;
          return { ...prev, mensagens: [...prev.mensagens, msg] };
        });
      }
      // Atualiza badge de não lidas na lista
      setConversas((prev) =>
        prev.map((c) =>
          c.id === convId && convId !== selecionadaRef.current
            ? { ...c, naoLidas: (c.naoLidas ?? 0) + 1, ultimaAtividadeEm: msg.criadoEm }
            : c,
        ),
      );
    });

    s.on('atend:status', (payload: { conversaId?: string; status: AtendStatusType }) => {
      const convId = payload.conversaId;
      if (convId) {
        setConversas((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, status: payload.status } : c)),
        );
        if (convId === selecionadaRef.current) {
          setDetalhe((prev) =>
            prev ? { ...prev, conversa: { ...prev.conversa, status: payload.status } } : prev,
          );
        }
      }
    });

    return () => { s.disconnect(); };
  }, []);

  // ── Abre conversa ─────────────────────────────────────────────────────────
  async function abrirConversa(id: string) {
    setSelecionadaId(id);
    setCarregandoDetalhe(true);
    setDetalhe(null);
    setErro('');
    // Entra na sala da conversa via socket
    socketRef.current?.emit('entrar_agente', { conversaIds: [id] });
    try {
      const d = await adminGet<ConversaDetalhe>(`/api/admin/atendimento/conversas/${id}`);
      setDetalhe(d);
      setTagsSelecionadas(d.conversa.tagIds ?? []);
      // Limpa badge de não lidas
      setConversas((prev) =>
        prev.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)),
      );
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir conversa.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  // ── Ações ─────────────────────────────────────────────────────────────────
  function feedback(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(''), 3000);
  }

  async function acao(path: string, body?: unknown) {
    setErro('');
    try {
      await adminPost(`/api/admin/atendimento/conversas/${selecionadaId}${path}`, body);
      await abrirConversa(selecionadaId!);
      carregarLista(filtros);
      return true;
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Operação falhou.');
      return false;
    }
  }

  async function assumir() {
    const sucesso = await acao('/assumir');
    if (sucesso) feedback('Conversa assumida com sucesso.');
  }

  async function atribuir() {
    if (!agenteIdAtribuir) return;
    const sucesso = await acao('/atribuir', { agenteId: agenteIdAtribuir });
    if (sucesso) { setModalAtribuir(false); feedback('Conversa atribuída.'); }
  }

  async function transferir() {
    if (!secretariaIdTransferir) return;
    const sucesso = await acao('/transferir', { secretariaId: secretariaIdTransferir });
    if (sucesso) { setModalTransferir(false); feedback('Conversa transferida.'); }
  }

  async function encerrar() {
    const sucesso = await acao('/encerrar', { mensagemEncerramento: msgEncerramento.trim() || undefined });
    if (sucesso) { setModalEncerrar(false); setMsgEncerramento(''); feedback('Conversa encerrada.'); }
  }

  async function salvarTags() {
    setErro('');
    try {
      await adminPatch(`/api/admin/atendimento/conversas/${selecionadaId}/tags`, { tagIds: tagsSelecionadas });
      setDetalhe((prev) =>
        prev ? { ...prev, conversa: { ...prev.conversa, tagIds: tagsSelecionadas } } : prev,
      );
      setConversas((prev) =>
        prev.map((c) => (c.id === selecionadaId ? { ...c, tagIds: tagsSelecionadas } : c)),
      );
      setModalTags(false);
      feedback('Tags salvas.');
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar tags.');
    }
  }

  async function doEnviarMensagem() {
    const v = texto.trim();
    if (!v || !selecionadaId || enviando) return;
    setTexto('');
    setEnviando(true);
    setErro('');
    try {
      const msg = await adminPost<MensagemAtend>(
        `/api/admin/atendimento/conversas/${selecionadaId}/mensagens`,
        { conteudo: v, interno },
      );
      setDetalhe((prev) => {
        if (!prev) return prev;
        const jaExiste = prev.mensagens.some((m) => m.id === msg.id);
        return jaExiste ? prev : { ...prev, mensagens: [...prev.mensagens, msg] };
      });
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao enviar mensagem.');
    } finally {
      setEnviando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    doEnviarMensagem();
  }

  function baixarTranscricao() {
    if (!selecionadaId) return;
    window.open(`${apiBase}/api/admin/atendimento/conversas/${selecionadaId}/transcricao`, '_blank', 'noopener');
  }

  // ── Insere emoji na posicao do cursor (textarea) ──────────────────────────
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
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const statusOpcoes: Array<{ value: string; label: string }> = [
    { value: '', label: 'Todos os status' },
    { value: 'bot', label: 'Bot' },
    { value: 'aguardando_agente', label: 'Aguardando' },
    { value: 'em_atendimento', label: 'Em atendimento' },
    { value: 'encerrada', label: 'Encerrada' },
  ];

  const canalOpcoes = [
    { value: '', label: 'Todos os canais' },
    { value: 'widget', label: 'Widget' },
    { value: 'whatsapp', label: 'WhatsApp' },
  ];

  const tagsMap = Object.fromEntries(tags.map((t) => [t.id, t]));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── Painel esquerdo: lista ────────────────────────────────────────── */}
      <aside
        className={[
          'flex flex-col border-r border-border bg-bg',
          selecionadaId ? 'hidden md:flex md:w-80 lg:w-96' : 'flex w-full md:w-80 lg:w-96',
        ].join(' ')}
        aria-label="Lista de conversas"
      >
        <div className="border-b border-border p-3">
          <AdminHeader title="Atendimento" description="Caixa de entrada unificada">
            <a href="/admin/atendimento/config" className={ui.btnGhost + ' text-xs'}>
              Configurações
            </a>
          </AdminHeader>

          {/* Filtros */}
          <div className="mt-2 space-y-1.5">
            <input
              type="search"
              placeholder="Buscar por nome, assunto…"
              value={filtros.q}
              onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value, page: 1 }))}
              aria-label="Buscar conversas"
              className={ui.input}
            />
            <div className="flex gap-1.5">
              <select
                value={filtros.status}
                onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value, page: 1 }))}
                aria-label="Filtrar por status"
                className={ui.input + ' flex-1'}
              >
                {statusOpcoes.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={filtros.canal}
                onChange={(e) => setFiltros((f) => ({ ...f, canal: e.target.value, page: 1 }))}
                aria-label="Filtrar por canal"
                className={ui.input + ' flex-1'}
              >
                {canalOpcoes.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {secretarias.length > 0 && (
              <select
                value={filtros.secretariaId}
                onChange={(e) => setFiltros((f) => ({ ...f, secretariaId: e.target.value, page: 1 }))}
                aria-label="Filtrar por secretaria"
                className={ui.input}
              >
                <option value="">Todas as secretarias</option>
                {secretarias.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversas">
          {carregandoLista && (
            <p className="p-4 text-sm text-fg/50" aria-live="polite">Carregando…</p>
          )}
          {!carregandoLista && conversas.length === 0 && (
            <p className="p-4 text-sm text-fg/50">Nenhuma conversa encontrada.</p>
          )}
          {conversas.map((c) => {
            const ativa = c.id === selecionadaId;
            return (
              <button
                key={c.id}
                role="listitem"
                onClick={() => abrirConversa(c.id)}
                aria-pressed={ativa}
                className={[
                  'flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors',
                  ativa ? 'bg-primary/10' : 'hover:bg-muted/40',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.visitanteNome ?? 'Visitante anônimo'}
                  </span>
                  <span className="shrink-0 text-[10px] text-fg/50">
                    {dataHora(c.ultimaAtividadeEm)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge status={c.status} />
                  <CanalBadge canal={c.canal} />
                  {c.tagIds?.map((tid) => tagsMap[tid] && (
                    <TagChip key={tid} nome={tagsMap[tid].nome} cor={tagsMap[tid].cor} />
                  ))}
                  {(c.naoLidas ?? 0) > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {c.naoLidas}
                    </span>
                  )}
                </div>
                {c.assunto && (
                  <p className="truncate text-xs text-fg/60">{c.assunto}</p>
                )}
                {c.secretariaNome && (
                  <p className="text-[11px] text-fg/50">{c.secretariaNome}</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Paginação */}
        {total > 20 && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <button
              disabled={filtros.page <= 1}
              onClick={() => setFiltros((f) => ({ ...f, page: f.page - 1 }))}
              className={ui.btnGhost + ' py-1 px-2 text-xs disabled:opacity-40'}
            >
              ← Anterior
            </button>
            <span className="text-fg/60">
              Pág. {filtros.page} · {total} total
            </span>
            <button
              disabled={filtros.page * 20 >= total}
              onClick={() => setFiltros((f) => ({ ...f, page: f.page + 1 }))}
              className={ui.btnGhost + ' py-1 px-2 text-xs disabled:opacity-40'}
            >
              Próxima →
            </button>
          </div>
        )}
      </aside>

      {/* ── Painel direito: detalhe ───────────────────────────────────────── */}
      <section
        className={[
          'flex flex-col flex-1 overflow-hidden',
          selecionadaId ? 'flex' : 'hidden md:flex',
        ].join(' ')}
        aria-label="Detalhe da conversa"
      >
        {!selecionadaId && (
          <div className="flex flex-1 items-center justify-center text-fg/40">
            <p className="text-sm">Selecione uma conversa para visualizar.</p>
          </div>
        )}

        {selecionadaId && (
          <>
            {/* Topbar do detalhe */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg px-4 py-2">
              <div className="flex items-center gap-2">
                {/* Voltar no mobile */}
                <button
                  onClick={() => setSelecionadaId(null)}
                  className="md:hidden rounded p-1 hover:bg-muted"
                  aria-label="Voltar à lista"
                >
                  ← Voltar
                </button>
                {detalhe && (
                  <div>
                    <p className="font-semibold text-sm leading-tight">
                      {detalhe.conversa.visitanteNome ?? 'Visitante anônimo'}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge status={detalhe.conversa.status} />
                      <CanalBadge canal={detalhe.conversa.canal} />
                      {detalhe.conversa.agenteNome && (
                        <span className="text-xs text-fg/60">Agente: {detalhe.conversa.agenteNome}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Ações */}
              {detalhe && (
                <div className="flex flex-wrap gap-1">
                  {detalhe.conversa.status !== 'encerrada' && detalhe.conversa.status !== 'em_atendimento' && (
                    <button onClick={assumir} className={ui.btn + ' py-1 px-2 text-xs'}>
                      Assumir
                    </button>
                  )}
                  <button
                    onClick={() => { setAgenteIdAtribuir(detalhe.conversa.agenteId ?? ''); setModalAtribuir(true); }}
                    className={ui.btnGhost + ' py-1 px-2 text-xs'}
                  >
                    Atribuir
                  </button>
                  <button
                    onClick={() => { setSecretariaIdTransferir(detalhe.conversa.secretariaId ?? ''); setModalTransferir(true); }}
                    className={ui.btnGhost + ' py-1 px-2 text-xs'}
                  >
                    Transferir
                  </button>
                  <button
                    onClick={() => setModalTags(true)}
                    className={ui.btnGhost + ' py-1 px-2 text-xs'}
                  >
                    Tags
                  </button>
                  <button onClick={baixarTranscricao} className={ui.btnGhost + ' py-1 px-2 text-xs'}>
                    .txt
                  </button>
                  {detalhe.conversa.status !== 'encerrada' && (
                    <button
                      onClick={() => setModalEncerrar(true)}
                      className={ui.btnDanger + ' py-1 px-2 text-xs'}
                    >
                      Encerrar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Info do visitante */}
            {detalhe && (
              <div className="shrink-0 flex gap-3 border-b border-border/50 bg-muted/20 px-4 py-1.5 text-xs text-fg/70 flex-wrap">
                {detalhe.conversa.visitanteEmail && (
                  <span>Email: <span className="text-fg">{detalhe.conversa.visitanteEmail}</span></span>
                )}
                {detalhe.conversa.visitanteTelefone && (
                  <span>Tel: <span className="text-fg">{detalhe.conversa.visitanteTelefone}</span></span>
                )}
                {detalhe.conversa.origemUrl && (
                  <span className="truncate max-w-xs">
                    Origem: <a href={detalhe.conversa.origemUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{detalhe.conversa.origemUrl}</a>
                  </span>
                )}
                {detalhe.conversa.secretariaNome && (
                  <span>Depto: <span className="text-fg">{detalhe.conversa.secretariaNome}</span></span>
                )}
                {detalhe.conversa.iniciadaEm && (
                  <span>Início: <span className="text-fg">{dataHora(detalhe.conversa.iniciadaEm)}</span></span>
                )}
                {detalhe.conversa.manifestacaoProtocolo && (
                  <span>
                    Manifestação:{' '}
                    {podeVerOuvidoria(sessao.role) ? (
                      <a
                        href="/admin/ouvidoria"
                        className="font-semibold text-primary underline"
                        title="Abrir no painel da Ouvidoria"
                      >
                        {detalhe.conversa.manifestacaoProtocolo} ↗
                      </a>
                    ) : (
                      <span className="font-semibold text-fg">
                        {detalhe.conversa.manifestacaoProtocolo}
                      </span>
                    )}
                  </span>
                )}
                {detalhe.conversa.tagIds?.length > 0 && (
                  <span className="flex items-center gap-1 flex-wrap">
                    Tags:
                    {detalhe.conversa.tagIds.map((tid) => tagsMap[tid] && (
                      <TagChip key={tid} nome={tagsMap[tid].nome} cor={tagsMap[tid].cor} />
                    ))}
                  </span>
                )}
              </div>
            )}

            {/* Avisos */}
            {(erro || ok) && (
              <div className="shrink-0 px-4 pt-2">
                {erro && <Aviso tipo="erro">{erro}</Aviso>}
                {ok && <Aviso tipo="ok">{ok}</Aviso>}
              </div>
            )}

            {/* Mensagens */}
            {carregandoDetalhe ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-fg/50" aria-live="polite">Carregando…</p>
              </div>
            ) : (
              <div
                className="flex-1 space-y-2 overflow-y-auto p-4"
                aria-live="polite"
                aria-atomic="false"
                aria-label="Mensagens da conversa"
              >
                {detalhe?.mensagens.map((m) => {
                  const ehAgente = m.autorTipo === 'agente';
                  const ehVisitante = m.autorTipo === 'visitante';
                  const ehInterno = m.interno;

                  return (
                    <div
                      key={m.id}
                      className={[
                        'flex',
                        ehVisitante ? 'justify-start' : 'justify-end',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                          ehInterno
                            ? 'border-2 border-dashed border-warning/50 bg-warning/10 text-fg'
                            : ehVisitante
                            ? 'rounded-bl-none border border-border bg-bg'
                            : ehAgente
                            ? 'rounded-br-none bg-primary/10 text-fg'
                            : m.autorTipo === 'bot'
                            ? 'rounded-bl-none bg-muted text-fg border border-border'
                            : 'bg-muted/60 text-fg/60 italic text-xs border border-border/40',
                        ].join(' ')}
                      >
                        <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                          {ehInterno && '🔒 Nota interna — '}
                          {m.autorNome ?? (m.autorTipo === 'bot' ? 'Bot' : m.autorTipo === 'sistema' ? 'Sistema' : 'Visitante')}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                        <p className="mt-0.5 text-right text-[10px] opacity-50">{hora(m.criadoEm)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={fimRef} />
              </div>
            )}

            {/* Composer */}
            {detalhe && detalhe.conversa.status !== 'encerrada' && (
              <form
                onSubmit={enviarMensagem}
                className="shrink-0 border-t border-border bg-bg p-3"
              >
                {/* Toggle nota interna */}
                <div className="mb-2 flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={interno}
                      onChange={(e) => setInterno(e.target.checked)}
                      className="h-3.5 w-3.5 accent-warning"
                    />
                    <span className={interno ? 'font-semibold text-warning' : 'text-fg/60'}>
                      Nota interna (visível só para a equipe)
                    </span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        doEnviarMensagem();
                      }
                    }}
                    placeholder={interno ? 'Nota interna (não enviada ao cidadão)…' : 'Resposta ao cidadão…'}
                    rows={2}
                    disabled={enviando}
                    aria-label="Mensagem"
                    className={[
                      ui.input,
                      'flex-1 resize-none',
                      interno ? 'border-warning/50 bg-warning/5' : '',
                    ].join(' ')}
                  />
                  <div className="flex flex-col gap-1 self-end">
                    <EmojiPicker onSelect={inserirEmoji} disabled={enviando} />
                    <button
                      type="submit"
                      disabled={!texto.trim() || enviando}
                      className={ui.btn + ' disabled:opacity-50'}
                    >
                      {enviando ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-fg/40">Enter envia · Shift+Enter nova linha</p>
              </form>
            )}
          </>
        )}
      </section>

      {/* ── Modais ────────────────────────────────────────────────────────── */}

      {/* Atribuir */}
      <Modal open={modalAtribuir} onClose={() => setModalAtribuir(false)} title="Atribuir conversa">
        <div className="space-y-3">
          <div>
            <label htmlFor="atrib-agente" className={ui.label}>Agente</label>
            <select
              id="atrib-agente"
              value={agenteIdAtribuir}
              onChange={(e) => setAgenteIdAtribuir(e.target.value)}
              className={ui.input + ' mt-1'}
            >
              <option value="">Selecione um agente…</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome} ({a.role})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalAtribuir(false)} className={ui.btnGhost}>Cancelar</button>
            <button onClick={atribuir} disabled={!agenteIdAtribuir} className={ui.btn}>Atribuir</button>
          </div>
        </div>
      </Modal>

      {/* Transferir */}
      <Modal open={modalTransferir} onClose={() => setModalTransferir(false)} title="Transferir conversa">
        <div className="space-y-3">
          <div>
            <label htmlFor="transf-sec" className={ui.label}>Secretaria / Departamento</label>
            <select
              id="transf-sec"
              value={secretariaIdTransferir}
              onChange={(e) => setSecretariaIdTransferir(e.target.value)}
              className={ui.input + ' mt-1'}
            >
              <option value="">Selecione…</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalTransferir(false)} className={ui.btnGhost}>Cancelar</button>
            <button onClick={transferir} disabled={!secretariaIdTransferir} className={ui.btn}>Transferir</button>
          </div>
        </div>
      </Modal>

      {/* Encerrar */}
      <Modal open={modalEncerrar} onClose={() => setModalEncerrar(false)} title="Encerrar conversa">
        <div className="space-y-3">
          <div>
            <label htmlFor="enc-msg" className={ui.label}>Mensagem de encerramento <span className="font-normal text-fg/50">(opcional)</span></label>
            <textarea
              id="enc-msg"
              value={msgEncerramento}
              onChange={(e) => setMsgEncerramento(e.target.value)}
              rows={3}
              className={ui.input + ' mt-1 resize-none'}
              placeholder="Ex.: Atendimento encerrado. Obrigado pelo contato!"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalEncerrar(false)} className={ui.btnGhost}>Cancelar</button>
            <button onClick={encerrar} className={ui.btnDanger}>Encerrar</button>
          </div>
        </div>
      </Modal>

      {/* Tags */}
      <Modal open={modalTags} onClose={() => setModalTags(false)} title="Gerenciar tags">
        <div className="space-y-3">
          {tags.length === 0 && (
            <p className="text-sm text-fg/50">
              Nenhuma tag cadastrada.{' '}
              <a href="/admin/atendimento/config" className="text-primary underline">Cadastrar tags</a>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const sel = tagsSelecionadas.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    setTagsSelecionadas((prev) =>
                      sel ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                    )
                  }
                  className={[
                    'rounded px-2 py-1 text-xs font-semibold transition-opacity',
                    sel ? 'opacity-100 ring-2 ring-offset-1' : 'opacity-60',
                  ].join(' ')}
                  style={{ backgroundColor: t.cor || '#888', color: '#fff', outlineColor: t.cor }}
                  aria-pressed={sel}
                >
                  {t.nome}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalTags(false)} className={ui.btnGhost}>Cancelar</button>
            <button onClick={salvarTags} className={ui.btn}>Salvar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
