'use client';

/**
 * Base de Conhecimento — aba "Perguntas e Respostas".
 * Ensina o bot com pares pergunta/resposta (respostas exatas e fixadas).
 *
 * Roles: GESTOR / ADMIN_PREFEITURA / TI (verificado no backend).
 * WCAG 2.1 AA · tema por tokens · pt-BR.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
} from '../../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../../_components/ui';

// ─── Tipos — Índice Vetorial ───────────────────────────────────────────────────

interface FonteContagem {
  fonte: string;
  chunks: number;
  ultimoCriado?: string | null;
}

interface IndexStatus {
  configurado: boolean;
  provider: 'voyage' | 'openai' | 'none';
  modelo: string;
  total: number;
  porFonte: FonteContagem[];
}

/** Formata número defensivamente — nunca lança em valor ausente/inesperado. */
function fmtNum(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR') : '0';
}

interface ReindexarResposta {
  enfileirado: boolean;
  configurado: boolean;
  aviso?: string;
}

// ─── Painel Busca Semântica ────────────────────────────────────────────────────

function PainelIndiceVetorial() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(true);
  const [erroStatus, setErroStatus] = useState('');

  const [reindexando, setReindexando] = useState(false);
  const [feedbackReindex, setFeedbackReindex] = useState<{
    tipo: 'ok' | 'erro' | 'aviso';
    msg: string;
  } | null>(null);

  const carregarStatus = useCallback(async () => {
    setCarregandoStatus(true);
    setErroStatus('');
    try {
      const dados = await adminGet<IndexStatus>('/api/admin/ia/index-status');
      setStatus(dados);
    } catch (err) {
      setErroStatus(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao carregar o status do índice vetorial.',
      );
    } finally {
      setCarregandoStatus(false);
    }
  }, []);

  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  async function reindexar() {
    setReindexando(true);
    setFeedbackReindex(null);
    try {
      const res = await adminPost<ReindexarResposta>('/api/admin/ia/reindexar');
      if (res.enfileirado) {
        setFeedbackReindex({
          tipo: 'ok',
          msg: 'Reindexação iniciada em segundo plano. Pode levar alguns minutos.',
        });
        setTimeout(() => {
          carregarStatus();
        }, 5000);
      } else {
        setFeedbackReindex({
          tipo: 'aviso',
          msg: res.aviso ?? 'A busca semântica não está configurada. Verifique as variáveis de ambiente.',
        });
      }
    } catch (err) {
      setFeedbackReindex({
        tipo: 'erro',
        msg:
          err instanceof AdminApiError
            ? err.message
            : 'Falha ao solicitar reindexação. Tente novamente.',
      });
    } finally {
      setTimeout(() => setReindexando(false), 6000);
    }
  }

  const providerLabel: Record<string, string> = {
    voyage: 'Voyage AI',
    openai: 'OpenAI',
    none: 'Nenhum',
  };

  return (
    <section
      aria-labelledby="indice-vetorial-titulo"
      className="rounded border border-border bg-bg p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="indice-vetorial-titulo"
            className="font-heading text-base font-bold"
          >
            Busca semântica (índice vetorial)
          </h2>
          <p className="mt-0.5 text-xs text-fg/60">
            A reindexação vetoriza o conteúdo do portal (páginas, serviços,
            notícias, secretarias, documentos), esta base de conhecimento e os
            artigos e materiais para o assistente entender perguntas por
            significado, não só por palavras.
          </p>
        </div>
        <button
          type="button"
          onClick={reindexar}
          disabled={reindexando || carregandoStatus}
          className={ui.btnGhost}
          aria-label="Reindexar conteúdo do portal agora"
        >
          {reindexando ? (
            <>
              <svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Reindexando…
            </>
          ) : (
            'Reindexar agora'
          )}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {feedbackReindex && (
          <p
            role={feedbackReindex.tipo === 'erro' ? 'alert' : 'status'}
            className={[
              'rounded border p-2 text-sm',
              feedbackReindex.tipo === 'ok'
                ? 'border-success text-success'
                : feedbackReindex.tipo === 'erro'
                  ? 'border-danger text-danger'
                  : 'border-warning text-fg/80 bg-warning/10',
            ].join(' ')}
          >
            {feedbackReindex.msg}
          </p>
        )}
      </div>

      <div aria-live="polite" aria-busy={carregandoStatus}>
        {carregandoStatus ? (
          <p className="text-sm text-fg/50" role="status">
            Verificando status do índice…
          </p>
        ) : erroStatus ? (
          <p role="alert" className="rounded border border-danger p-2 text-sm text-danger">
            {erroStatus}
          </p>
        ) : status && !status.configurado ? (
          <div className="rounded border border-warning/40 bg-warning/5 p-3 text-sm text-fg/80">
            <p>
              A busca semântica está{' '}
              <strong>desligada</strong>. Configure uma chave de embeddings
              (Voyage AI ou OpenAI) no ambiente para ativar. Enquanto isso, o
              assistente usa busca por texto (full-text), que já funciona.
            </p>
          </div>
        ) : status ? (
          <div className="space-y-3">
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <dt className="text-fg/60 font-medium">Provedor:</dt>
                <dd className="font-semibold text-fg">
                  {providerLabel[status.provider] ?? status.provider}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-fg/60 font-medium">Modelo:</dt>
                <dd className="font-mono text-xs font-semibold text-fg bg-muted px-1.5 py-0.5 rounded">
                  {status.modelo}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-fg/60 font-medium">Trechos indexados:</dt>
                <dd className="font-bold text-primary text-base">
                  {fmtNum(status.total)}
                </dd>
              </div>
            </dl>

            {(status.porFonte?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm border-collapse"
                  aria-label="Distribuição de trechos por fonte"
                >
                  <thead>
                    <tr>
                      <th className={`${ui.th} w-3/4`} scope="col">Fonte</th>
                      <th className={`${ui.th} text-right`} scope="col">Trechos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(status.porFonte ?? []).map((f) => (
                      <tr key={f.fonte} className="hover:bg-muted/40">
                        <td className={ui.td}>
                          <span className="capitalize">{f.fonte}</span>
                        </td>
                        <td className={`${ui.td} text-right tabular-nums`}>
                          {fmtNum(f.chunks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemConhecimento {
  id: string;
  pergunta: string;
  resposta: string;
  tags: string[];
  fixado: boolean;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

// ─── Editor de Tags (chips add/remove) ───────────────────────────────────────

function TagsEditor({
  value,
  onChange,
  inputId,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  inputId: string;
}) {
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function confirmar(texto: string) {
    const tag = texto.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setRaw('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (e.key !== 'Tab' || raw.trim()) e.preventDefault();
      confirmar(raw);
    } else if (e.key === 'Backspace' && raw === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function handleBlur() {
    if (raw.trim()) confirmar(raw);
  }

  function remover(tag: string) {
    onChange(value.filter((t) => t !== tag));
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 rounded border border-border bg-bg px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary cursor-text"
      onClick={() => inputRef.current?.focus()}
      aria-label="Editor de tags"
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
        >
          {tag}
          <button
            type="button"
            onClick={() => remover(tag)}
            aria-label={`Remover tag ${tag}`}
            className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? 'Digite e pressione Enter ou vírgula' : ''}
        aria-describedby={`${inputId}-desc`}
        className="min-w-[140px] flex-1 bg-transparent text-sm outline-none"
      />
      <span id={`${inputId}-desc`} className="sr-only">
        Pressione Enter ou vírgula para adicionar. Backspace remove a última tag.
      </span>
    </div>
  );
}

// ─── Modal Criar / Editar ─────────────────────────────────────────────────────

interface FormState {
  pergunta: string;
  resposta: string;
  tags: string[];
  fixado: boolean;
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  pergunta: '',
  resposta: '',
  tags: [],
  fixado: false,
  ativo: true,
};

function ModalFormulario({
  open,
  item,
  onClose,
  onSalvo,
}: {
  open: boolean;
  item: ItemConhecimento | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setFormRaw] = useState<FormState>(FORM_VAZIO);
  const formRef = useRef<FormState>(FORM_VAZIO);

  function setForm(next: FormState) {
    formRef.current = next;
    setFormRaw(next);
  }

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    const inicial: FormState = item
      ? {
          pergunta: item.pergunta,
          resposta: item.resposta,
          tags: item.tags ?? [],
          fixado: item.fixado,
          ativo: item.ativo,
        }
      : FORM_VAZIO;
    setForm(inicial);
    setErro('');
    setSalvando(false);
  }, [open, item]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const f = formRef.current;
    if (!f.pergunta.trim()) {
      setErro('O campo Pergunta é obrigatório.');
      return;
    }
    if (!f.resposta.trim()) {
      setErro('O campo Resposta é obrigatória.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const body = {
        pergunta: f.pergunta.trim(),
        resposta: f.resposta.trim(),
        tags: f.tags,
        fixado: f.fixado,
        ativo: f.ativo,
      };
      if (item) {
        await adminPut(`/api/admin/ia/conhecimento/${item.id}`, body);
      } else {
        await adminPost('/api/admin/ia/conhecimento', body);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(
        err instanceof AdminApiError ? err.message : 'Falha ao salvar. Tente novamente.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar item de conhecimento' : 'Novo item de conhecimento'}
    >
      <form onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${idBase}-pergunta`} className={ui.label}>
            Pergunta <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-pergunta`}
            className={`${ui.input} mt-1`}
            value={form.pergunta}
            onChange={(e) => setForm({ ...formRef.current, pergunta: e.target.value })}
            required
            aria-required="true"
            placeholder="Ex.: Qual o telefone da Prefeitura?"
            maxLength={500}
          />
        </div>

        <div>
          <label htmlFor={`${idBase}-resposta`} className={ui.label}>
            Resposta <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${idBase}-resposta`}
            className={`${ui.input} mt-1 min-h-[120px] resize-y`}
            value={form.resposta}
            onChange={(e) => setForm({ ...formRef.current, resposta: e.target.value })}
            required
            aria-required="true"
            placeholder="Resposta oficial que o bot vai priorizar."
          />
        </div>

        <div>
          <label htmlFor={`${idBase}-tags`} className={ui.label}>
            Tags{' '}
            <span className="font-normal text-fg/50">
              (Enter ou vírgula para adicionar)
            </span>
          </label>
          <div className="mt-1">
            <TagsEditor
              inputId={`${idBase}-tags`}
              value={form.tags}
              onChange={(tags) => setForm({ ...formRef.current, tags })}
            />
          </div>
        </div>

        <fieldset className="space-y-2 rounded border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-fg/70">Opções</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.fixado}
              onChange={(e) =>
                setForm({ ...formRef.current, fixado: e.target.checked })
              }
              className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
              aria-describedby={`${idBase}-fixado-desc`}
            />
            <span className="text-sm font-semibold">Fixado</span>
          </label>
          <p id={`${idBase}-fixado-desc`} className="ml-6 text-xs text-fg/50">
            Itens fixados são sempre considerados pelo bot, mesmo sem correspondência direta na pergunta.
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) =>
                setForm({ ...formRef.current, ativo: e.target.checked })
              }
              className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm font-semibold">Ativo</span>
            <span className="text-xs text-fg/50">(itens inativos são ignorados pelo bot)</span>
          </label>
        </fieldset>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : item ? 'Salvar alterações' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal de Exclusão ────────────────────────────────────────────────────────

function ModalExcluir({
  item,
  onClose,
  onExcluido,
}: {
  item: ItemConhecimento | null;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!item) setErro('');
  }, [item]);

  async function confirmar() {
    if (!item) return;
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/ia/conhecimento/${item.id}`);
      onExcluido();
      onClose();
    } catch (err) {
      setErro(
        err instanceof AdminApiError ? err.message : 'Falha ao excluir. Tente novamente.',
      );
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal open={item !== null} onClose={onClose} title="Excluir item de conhecimento">
      <div className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {item && (
          <p className="text-sm">
            Deseja excluir o item{' '}
            <strong>
              &quot;
              {item.pergunta.length > 80
                ? item.pergunta.slice(0, 80) + '…'
                : item.pergunta}
              &quot;
            </strong>
            ? Esta ação não pode ser desfeita.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={excluindo}
            className={ui.btnDanger}
          >
            {excluindo ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function PerguntasRespostasPage() {
  const [lista, setLista] = useState<ItemConhecimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [busca, setBusca] = useState('');

  const [modalFormAberto, setModalFormAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState<ItemConhecimento | null>(null);
  const [itemExcluindo, setItemExcluindo] = useState<ItemConhecimento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<ItemConhecimento[]>('/api/admin/ia/conhecimento');
      const ordenados = [...dados].sort((a, b) => {
        if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
        return new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime();
      });
      setLista(ordenados);
    } catch (err) {
      setErro(
        err instanceof AdminApiError ? err.message : 'Falha ao carregar a base de conhecimento.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(''), 3500);
  }

  function abrirNovo() {
    setItemEditando(null);
    setModalFormAberto(true);
  }

  function abrirEditar(item: ItemConhecimento) {
    setItemEditando(item);
    setModalFormAberto(true);
  }

  const listafiltrada = lista.filter((item) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      item.pergunta.toLowerCase().includes(q) ||
      item.resposta.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Sub-cabeçalho desta aba */}
      <AdminHeader
        title="Perguntas e Respostas"
        description="Ensine o assistente virtual com pares de pergunta/resposta. O bot prioriza estas respostas. Marque como Fixado os fatos essenciais (sempre considerados)."
      >
        <button className={ui.btn} onClick={abrirNovo}>
          + Novo item
        </button>
      </AdminHeader>

      {/* Dica de uso */}
      <aside
        className="rounded border border-primary/20 bg-primary/5 p-4 text-sm text-fg/80"
        aria-label="Dica de uso"
      >
        <p>
          <strong>Exemplos de perguntas úteis:</strong>{' '}
          &quot;Qual o telefone da Prefeitura?&quot;, &quot;Como solicitar a 2ª via do IPTU?&quot;,
          &quot;Horário de funcionamento&quot;. Use o campo{' '}
          <strong>Fixado</strong> para a identidade da entidade e contatos principais — esses
          itens são sempre considerados pelo bot, independentemente da pergunta do cidadão.
        </p>
      </aside>

      {/* Painel busca semântica */}
      <PainelIndiceVetorial />

      {/* Feedback */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* Barra de busca */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <label htmlFor="busca-conhecimento" className="sr-only">
            Filtrar base de conhecimento
          </label>
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg/40"
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </span>
          <input
            id="busca-conhecimento"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por pergunta, resposta ou tag…"
            className={`${ui.input} pl-9`}
            aria-label="Filtrar itens da base de conhecimento"
          />
        </div>
        {busca && (
          <span className="text-xs text-fg/50" aria-live="polite">
            {listafiltrada.length} resultado(s)
          </span>
        )}
      </div>

      {/* Lista */}
      <section aria-label="Base de conhecimento" aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-12 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : listafiltrada.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-fg/60">
              {busca
                ? 'Nenhum item encontrado para este filtro.'
                : 'Nenhum item cadastrado. Adicione o primeiro para treinar o assistente.'}
            </p>
            {!busca && (
              <button onClick={abrirNovo} className={ui.btn}>
                Adicionar primeiro item
              </button>
            )}
          </div>
        ) : (
          <ul role="list" className="space-y-3">
            {listafiltrada.map((item) => (
              <li
                key={item.id}
                className={[
                  'rounded border bg-bg p-4 transition-colors',
                  item.fixado ? 'border-primary/40' : 'border-border',
                  !item.ativo ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.fixado && (
                        <span
                          className={`${ui.badge} bg-primary/10 text-primary`}
                          title="Sempre considerado pelo bot"
                        >
                          Fixado
                        </span>
                      )}
                      {!item.ativo && (
                        <span className={`${ui.badge} bg-muted text-fg/50`}>
                          Inativo
                        </span>
                      )}
                    </div>

                    <p className="font-semibold text-fg line-clamp-2">{item.pergunta}</p>
                    <p className="text-sm text-fg/60 line-clamp-2">{item.resposta}</p>

                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5" aria-label="Tags">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`${ui.badge} bg-secondary/10 text-secondary`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-fg/40">
                      Atualizado em {formatarData(item.atualizadoEm)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={ui.btnGhost}
                      onClick={() => abrirEditar(item)}
                      aria-label={`Editar: ${item.pergunta}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={ui.btnDanger}
                      onClick={() => setItemExcluindo(item)}
                      aria-label={`Excluir: ${item.pergunta}`}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!carregando && lista.length > 0 && (
        <p className="text-xs text-fg/40" aria-live="polite">
          {lista.length} item(s) na base · {lista.filter((i) => i.fixado).length} fixado(s) ·{' '}
          {lista.filter((i) => !i.ativo).length} inativo(s)
        </p>
      )}

      <ModalFormulario
        open={modalFormAberto}
        item={itemEditando}
        onClose={() => setModalFormAberto(false)}
        onSalvo={() => {
          mostrarAviso(itemEditando ? 'Item atualizado com sucesso.' : 'Item adicionado com sucesso.');
          carregar();
        }}
      />

      <ModalExcluir
        item={itemExcluindo}
        onClose={() => setItemExcluindo(null)}
        onExcluido={() => {
          mostrarAviso('Item excluído.');
          carregar();
        }}
      />
    </div>
  );
}
