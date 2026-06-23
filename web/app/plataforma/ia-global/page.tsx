'use client';

/**
 * Gerenciador da Plataforma — IA Global (super_admin).
 *
 * Gerencie a base de conhecimento GLOBAL da IA: legislação e normas de
 * contabilidade pública compartilhadas entre todas as prefeituras.
 *
 * Rotas da API consumidas:
 *   GET  /api/_platform/ia/status
 *   GET  /api/_platform/ia/conteudos?dominio=&q=
 *   GET  /api/_platform/ia/conteudos/:id
 *   POST /api/_platform/ia/conteudos
 *   PUT  /api/_platform/ia/conteudos/:id
 *   DELETE /api/_platform/ia/conteudos/:id
 *   POST /api/_platform/ia/reindexar
 *
 * WCAG 2.1 AA · tokens CSS do tema · pt-BR · super_admin apenas
 * (o gate já é feito no layout.tsx de /plataforma).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import {
  IA_GLOBAL_DOMINIOS,
  reindexarIaGlobal,
  type IaGlobalConteudo,
  type IaGlobalStatus,
} from '../../../lib/platform';
import { AdminHeader, Aviso, Modal, ui } from '../../admin/_components/ui';

// ── Categorias sugeridas ──────────────────────────────────────────────────────

const CATEGORIAS_SUGERIDAS = ['lei', 'resumo', 'manual'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelDominio(slug: string): string {
  return IA_GLOBAL_DOMINIOS.find((d) => d.value === slug)?.label ?? slug;
}

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

// ── Editor de Tags (chips add/remove) ────────────────────────────────────────

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
    if (tag && !value.includes(tag)) onChange([...value, tag]);
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
      role="group"
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
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="currentColor"
            >
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
        placeholder={
          value.length === 0 ? 'Digite e pressione Enter ou vírgula' : ''
        }
        aria-describedby={`${inputId}-desc`}
        className="min-w-[140px] flex-1 bg-transparent text-sm outline-none"
      />
      <span id={`${inputId}-desc`} className="sr-only">
        Pressione Enter ou vírgula para adicionar uma tag. Backspace remove a
        última.
      </span>
    </div>
  );
}

// ── Formulário (Modal criar/editar) ──────────────────────────────────────────

interface FormState {
  dominio: string;
  categoria: string;
  leiReferencia: string;
  fonteUrl: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  dominio: '',
  categoria: '',
  leiReferencia: '',
  fonteUrl: '',
  titulo: '',
  conteudo: '',
  tags: [],
  ativo: true,
};

function ModalFormulario({
  open,
  itemId,
  onClose,
  onSalvo,
}: {
  open: boolean;
  itemId: string | null;
  onClose: () => void;
  onSalvo: (msg: string) => void;
}) {
  const idBase = useId();

  const [form, setFormRaw] = useState<FormState>(FORM_VAZIO);
  const formRef = useRef<FormState>(FORM_VAZIO);

  function setForm(next: FormState) {
    formRef.current = next;
    setFormRaw(next);
  }

  const [carregandoItem, setCarregandoItem] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega o item completo ao abrir em modo edição
  useEffect(() => {
    if (!open) return;
    setErro('');
    setSalvando(false);

    if (!itemId) {
      setForm(FORM_VAZIO);
      return;
    }

    setCarregandoItem(true);
    adminGet<IaGlobalConteudo>(`/api/_platform/ia/conteudos/${itemId}`)
      .then((item) => {
        setForm({
          dominio: item.dominio,
          categoria: item.categoria ?? '',
          leiReferencia: item.leiReferencia ?? '',
          fonteUrl: item.fonteUrl ?? '',
          titulo: item.titulo,
          conteudo: item.conteudo ?? '',
          tags: item.tags ?? [],
          ativo: item.ativo,
        });
      })
      .catch((err) => {
        setErro(
          err instanceof AdminApiError
            ? err.message
            : 'Falha ao carregar o conteúdo.',
        );
      })
      .finally(() => setCarregandoItem(false));
  }, [open, itemId]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const f = formRef.current;

    if (!f.dominio) {
      setErro('O campo Domínio é obrigatório.');
      return;
    }
    if (!f.titulo.trim()) {
      setErro('O campo Título é obrigatório.');
      return;
    }
    if (!f.conteudo.trim()) {
      setErro('O campo Conteúdo é obrigatório.');
      return;
    }

    setSalvando(true);
    setErro('');

    const body = {
      dominio: f.dominio,
      titulo: f.titulo.trim(),
      conteudo: f.conteudo.trim(),
      categoria: f.categoria.trim() || undefined,
      leiReferencia: f.leiReferencia.trim() || undefined,
      fonteUrl: f.fonteUrl.trim() || undefined,
      tags: f.tags,
      ativo: f.ativo,
    };

    try {
      if (itemId) {
        await adminPut(`/api/_platform/ia/conteudos/${itemId}`, body);
        onSalvo('Conteúdo atualizado com sucesso.');
      } else {
        await adminPost('/api/_platform/ia/conteudos', body);
        onSalvo('Conteúdo adicionado com sucesso.');
      }
      onClose();
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao salvar. Tente novamente.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const tituloModal = itemId ? 'Editar conteúdo global' : 'Novo conteúdo global';

  return (
    <Modal open={open} onClose={onClose} title={tituloModal}>
      {carregandoItem ? (
        <p className="py-8 text-center text-sm text-fg/60" role="status">
          Carregando conteúdo…
        </p>
      ) : (
        <form onSubmit={salvar} noValidate className="space-y-4">
          {/* Domínio */}
          <div>
            <label htmlFor={`${idBase}-dominio`} className={ui.label}>
              Domínio <span aria-hidden="true">*</span>
            </label>
            <select
              id={`${idBase}-dominio`}
              className={`${ui.input} mt-1`}
              value={form.dominio}
              onChange={(e) =>
                setForm({ ...formRef.current, dominio: e.target.value })
              }
              required
              aria-required="true"
            >
              <option value="">Selecione o domínio jurídico…</option>
              {IA_GLOBAL_DOMINIOS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label htmlFor={`${idBase}-titulo`} className={ui.label}>
              Título <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-titulo`}
              className={`${ui.input} mt-1`}
              value={form.titulo}
              onChange={(e) =>
                setForm({ ...formRef.current, titulo: e.target.value })
              }
              required
              aria-required="true"
              placeholder="Ex.: Lei nº 14.133/2021 — Nova Lei de Licitações"
              maxLength={255}
            />
          </div>

          {/* Categoria (datalist) */}
          <div>
            <label htmlFor={`${idBase}-categoria`} className={ui.label}>
              Categoria
            </label>
            <input
              id={`${idBase}-categoria`}
              list={`${idBase}-categoria-list`}
              className={`${ui.input} mt-1`}
              value={form.categoria}
              onChange={(e) =>
                setForm({ ...formRef.current, categoria: e.target.value })
              }
              placeholder="lei / resumo / manual"
              maxLength={100}
              aria-describedby={`${idBase}-categoria-desc`}
            />
            <datalist id={`${idBase}-categoria-list`}>
              {CATEGORIAS_SUGERIDAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p id={`${idBase}-categoria-desc`} className="mt-0.5 text-xs text-fg/50">
              Sugestões: lei, resumo, manual. Pode ser qualquer texto.
            </p>
          </div>

          {/* Lei de referência */}
          <div>
            <label htmlFor={`${idBase}-lei`} className={ui.label}>
              Lei / norma de referência
            </label>
            <input
              id={`${idBase}-lei`}
              className={`${ui.input} mt-1`}
              value={form.leiReferencia}
              onChange={(e) =>
                setForm({ ...formRef.current, leiReferencia: e.target.value })
              }
              placeholder="Ex.: Lei nº 14.133/2021"
              maxLength={200}
              aria-describedby={`${idBase}-lei-desc`}
            />
            <p id={`${idBase}-lei-desc`} className="mt-0.5 text-xs text-fg/50">
              Número e nome da lei, decreto ou norma. Aparece na listagem.
            </p>
          </div>

          {/* Fonte URL */}
          <div>
            <label htmlFor={`${idBase}-fonte`} className={ui.label}>
              URL da fonte oficial
            </label>
            <input
              id={`${idBase}-fonte`}
              type="url"
              className={`${ui.input} mt-1`}
              value={form.fonteUrl}
              onChange={(e) =>
                setForm({ ...formRef.current, fonteUrl: e.target.value })
              }
              placeholder="https://www.planalto.gov.br/..."
              maxLength={500}
            />
          </div>

          {/* Conteúdo */}
          <div>
            <label htmlFor={`${idBase}-conteudo`} className={ui.label}>
              Conteúdo <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${idBase}-conteudo`}
              className={`${ui.input} mt-1 min-h-[240px] resize-y font-mono text-xs leading-relaxed`}
              value={form.conteudo}
              onChange={(e) =>
                setForm({ ...formRef.current, conteudo: e.target.value })
              }
              required
              aria-required="true"
              aria-describedby={`${idBase}-conteudo-desc`}
              placeholder="Cole o texto completo da lei/norma ou um resumo estruturado. Aceita Markdown."
            />
            <p id={`${idBase}-conteudo-desc`} className="mt-0.5 text-xs text-fg/50">
              Aceita texto longo e Markdown. O assistente usa trechos deste
              conteúdo para responder cidadãos de TODAS as prefeituras.
            </p>
          </div>

          {/* Tags */}
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

          {/* Toggle ativo */}
          <fieldset className="space-y-2 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">
              Visibilidade
            </legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) =>
                  setForm({ ...formRef.current, ativo: e.target.checked })
                }
                className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                aria-describedby={`${idBase}-ativo-desc`}
              />
              <span className="text-sm font-semibold">Ativo</span>
            </label>
            <p id={`${idBase}-ativo-desc`} className="ml-6 text-xs text-fg/50">
              Conteúdo inativo é ignorado pelo assistente de TODAS as
              prefeituras.
            </p>
          </fieldset>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={ui.btn}>
              {salvando
                ? 'Salvando…'
                : itemId
                  ? 'Salvar alterações'
                  : 'Adicionar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Modal de Exclusão ─────────────────────────────────────────────────────────

function ModalExcluir({
  item,
  onClose,
  onExcluido,
}: {
  item: IaGlobalConteudo | null;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!item) {
      setErro('');
      setExcluindo(false);
    }
  }, [item]);

  async function confirmar() {
    if (!item) return;
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/_platform/ia/conteudos/${item.id}`);
      onExcluido();
      onClose();
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao excluir. Tente novamente.',
      );
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal open={item !== null} onClose={onClose} title="Excluir conteúdo global">
      <div className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {item && (
          <p className="text-sm">
            Deseja excluir{' '}
            <strong>
              &quot;
              {item.titulo.length > 80
                ? item.titulo.slice(0, 80) + '…'
                : item.titulo}
              &quot;
            </strong>
            ? Esta ação não pode ser desfeita. O conteúdo será removido da base
            de conhecimento global da IA.
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

// ── Painel de status da IA global ─────────────────────────────────────────────

function PainelStatus({
  status,
  carregando,
  onReindexar,
}: {
  status: IaGlobalStatus | null;
  carregando: boolean;
  onReindexar: () => void;
}) {
  const [reindexando, setReindexando] = useState(false);
  const [feedbackReindex, setFeedbackReindex] = useState<{
    tipo: 'ok' | 'erro';
    msg: string;
  } | null>(null);

  async function handleReindexar() {
    setReindexando(true);
    setFeedbackReindex(null);
    try {
      const r = await reindexarIaGlobal();
      if (r.enfileirado) {
        setFeedbackReindex({
          tipo: 'ok',
          msg: 'Reindexação enfileirada. O processo ocorre em segundo plano.',
        });
      } else {
        setFeedbackReindex({
          tipo: 'erro',
          msg: 'Não foi possível enfileirar a reindexação.',
        });
      }
    } catch (err) {
      setFeedbackReindex({
        tipo: 'erro',
        msg:
          err instanceof AdminApiError
            ? err.message
            : 'Falha ao solicitar reindexação.',
      });
    } finally {
      setReindexando(false);
    }
  }

  if (carregando) {
    return (
      <div
        className="rounded border border-border bg-muted/30 p-4"
        aria-busy="true"
      >
        <p className="text-sm text-fg/60" role="status">
          Carregando status da IA…
        </p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="status-ia-titulo"
      className="rounded border border-border bg-muted/30 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="status-ia-titulo"
            className="text-sm font-semibold text-fg/80"
          >
            Status da IA Global
          </h2>

          {status ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {/* Configurado? */}
              <span
                className={`${ui.badge} ${status.configurado ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
              >
                {status.configurado ? 'Configurada' : 'Sem chave de embeddings'}
              </span>

              {/* Provider */}
              {status.provider && (
                <span className={`${ui.badge} bg-primary/10 text-primary`}>
                  {status.provider}
                </span>
              )}

              {/* Chunks indexados */}
              <span className="text-fg/70">
                <strong className="text-fg">{status.chunks.toLocaleString('pt-BR')}</strong>{' '}
                chunk{status.chunks !== 1 ? 's' : ''} indexado
                {status.chunks !== 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <p className="text-sm text-fg/50">Status indisponível.</p>
          )}

          {status && !status.configurado && (
            <p
              role="alert"
              className="text-xs text-danger"
            >
              Configure a chave de embeddings da plataforma em{' '}
              <a
                href="/plataforma/configuracoes"
                className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
              >
                Configurações
              </a>{' '}
              (aba IA).
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleReindexar}
          disabled={reindexando}
          aria-busy={reindexando}
          className={`${ui.btn} shrink-0`}
        >
          {reindexando ? 'Enfileirando…' : 'Reindexar acervo global'}
        </button>
      </div>

      {feedbackReindex && (
        <div aria-live="polite">
          <Aviso tipo={feedbackReindex.tipo}>{feedbackReindex.msg}</Aviso>
        </div>
      )}
    </section>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────

export default function IaGlobalPage() {
  // Status
  const [status, setStatus] = useState<IaGlobalStatus | null>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(true);

  // Lista
  const [lista, setLista] = useState<IaGlobalConteudo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  // Filtros
  const [filtroDominio, setFiltroDominio] = useState('');
  const [filtroQ, setFiltroQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Debounce da busca textual
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filtroQ), 350);
    return () => clearTimeout(t);
  }, [filtroQ]);

  // Modais
  const [modalFormAberto, setModalFormAberto] = useState(false);
  const [itemEditandoId, setItemEditandoId] = useState<string | null>(null);
  const [itemExcluindo, setItemExcluindo] = useState<IaGlobalConteudo | null>(
    null,
  );

  // Carrega status uma vez
  useEffect(() => {
    adminGet<IaGlobalStatus>('/api/_platform/ia/status')
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setCarregandoStatus(false));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params: Record<string, string> = {};
      if (filtroDominio) params.dominio = filtroDominio;
      if (debouncedQ) params.q = debouncedQ;

      const dados = await adminGet<IaGlobalConteudo[]>(
        `/api/_platform/ia/conteudos${qs(params)}`,
      );
      setLista(dados);
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao carregar os conteúdos.',
      );
    } finally {
      setCarregando(false);
    }
  }, [filtroDominio, debouncedQ]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(''), 4000);
  }

  function abrirNovo() {
    setItemEditandoId(null);
    setModalFormAberto(true);
  }

  function abrirEditar(item: IaGlobalConteudo) {
    setItemEditandoId(item.id);
    setModalFormAberto(true);
  }

  function fecharForm() {
    setModalFormAberto(false);
    setTimeout(() => setItemEditandoId(null), 200);
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <AdminHeader
        title="IA Global — Base de Conhecimento"
        description="Legislação e normas compartilhadas entre todas as prefeituras."
      >
        <button
          className={ui.btn}
          onClick={abrirNovo}
          aria-label="Adicionar novo conteúdo global"
        >
          + Novo conteúdo
        </button>
      </AdminHeader>

      {/* Painel de status */}
      <PainelStatus
        status={status}
        carregando={carregandoStatus}
        onReindexar={carregar}
      />

      {/* Texto de ajuda */}
      <aside
        className="rounded border border-primary/20 bg-primary/5 p-4 text-sm text-fg/80"
        aria-label="Como funciona a IA global"
      >
        <p>
          <strong>Como funciona:</strong> estes conteúdos alimentam o RAG da IA
          para <em>todas</em> as prefeituras da plataforma. Use para leis
          federais, normas contábeis e manuais que valem universalmente (ex.:
          Lei de Licitações, LGPD, Lei de Acesso à Informação). Conteúdos
          específicos de cada prefeitura devem ser gerenciados no painel de IA
          da própria entidade.
        </p>
      </aside>

      {/* Feedback */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-wrap gap-3">
        {/* Domínio */}
        <div className="min-w-[200px]">
          <label htmlFor="filtro-dominio" className="sr-only">
            Filtrar por domínio
          </label>
          <select
            id="filtro-dominio"
            value={filtroDominio}
            onChange={(e) => {
              setFiltroDominio(e.target.value);
            }}
            className={ui.input}
            aria-label="Filtrar por domínio jurídico"
          >
            <option value="">Todos os domínios</option>
            {IA_GLOBAL_DOMINIOS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Busca textual */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <label htmlFor="filtro-q" className="sr-only">
            Buscar por título
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
            id="filtro-q"
            type="search"
            value={filtroQ}
            onChange={(e) => setFiltroQ(e.target.value)}
            placeholder="Buscar por título…"
            className={`${ui.input} pl-9`}
          />
        </div>

        {/* Limpar */}
        {(filtroQ || filtroDominio) && (
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => {
              setFiltroQ('');
              setFiltroDominio('');
            }}
            aria-label="Limpar todos os filtros"
          >
            Limpar filtros
          </button>
        )}
      </section>

      {/* Lista */}
      <section
        aria-label="Conteúdos globais da IA"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-12 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-fg/60">
              {filtroQ || filtroDominio
                ? 'Nenhum conteúdo encontrado para os filtros aplicados.'
                : 'Nenhum conteúdo global cadastrado. Adicione o primeiro para treinar o assistente.'}
            </p>
            {!filtroQ && !filtroDominio && (
              <button onClick={abrirNovo} className={ui.btn}>
                Adicionar primeiro conteúdo
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-fg/40" aria-live="polite">
              {lista.length} conteúdo{lista.length !== 1 ? 's' : ''}{' '}
              encontrado{lista.length !== 1 ? 's' : ''}
            </p>

            {/* Tabela */}
            <div className={`${ui.card} overflow-x-auto`}>
              <table
                className="w-full border-collapse text-sm"
                aria-label="Conteúdos globais da IA"
              >
                <thead>
                  <tr>
                    <th scope="col" className={ui.th}>
                      Título
                    </th>
                    <th scope="col" className={`${ui.th} hidden sm:table-cell`}>
                      Domínio
                    </th>
                    <th scope="col" className={`${ui.th} hidden md:table-cell`}>
                      Lei / norma
                    </th>
                    <th scope="col" className={`${ui.th} hidden lg:table-cell`}>
                      Atualizado
                    </th>
                    <th scope="col" className={ui.th}>
                      Status
                    </th>
                    <th scope="col" className={ui.th}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((item) => (
                    <tr
                      key={item.id}
                      className={[
                        'hover:bg-muted/40',
                        !item.ativo ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      {/* Título + tags */}
                      <td className={ui.td}>
                        <span className="font-semibold text-fg">
                          {item.titulo}
                        </span>
                        {item.tags.length > 0 && (
                          <div
                            className="mt-1 flex flex-wrap gap-1"
                            aria-label="Tags"
                          >
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className={`${ui.badge} bg-primary/10 text-primary`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Domínio */}
                      <td className={`${ui.td} hidden sm:table-cell`}>
                        <span
                          className={`${ui.badge} bg-secondary/10 text-secondary`}
                        >
                          {labelDominio(item.dominio)}
                        </span>
                        {item.categoria && (
                          <span className="ml-1.5 text-xs text-fg/50">
                            {item.categoria}
                          </span>
                        )}
                      </td>

                      {/* Lei */}
                      <td
                        className={`${ui.td} hidden md:table-cell text-xs text-fg/70`}
                      >
                        {item.leiReferencia ? (
                          item.fonteUrl ? (
                            <a
                              href={item.fonteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              aria-label={`Fonte: ${item.leiReferencia}`}
                            >
                              {item.leiReferencia}
                            </a>
                          ) : (
                            item.leiReferencia
                          )
                        ) : (
                          <span className="text-fg/30">—</span>
                        )}
                      </td>

                      {/* Atualizado */}
                      <td
                        className={`${ui.td} hidden lg:table-cell text-xs text-fg/50`}
                      >
                        {formatarData(item.atualizadoEm)}
                      </td>

                      {/* Status */}
                      <td className={ui.td}>
                        <span
                          className={`${ui.badge} ${item.ativo ? 'bg-success/15 text-success' : 'bg-muted text-fg/50'}`}
                        >
                          {item.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className={ui.td}>
                        <span className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={`${ui.btnGhost} py-1 text-xs`}
                            onClick={() => abrirEditar(item)}
                            aria-label={`Editar: ${item.titulo}`}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${ui.btnDanger} py-1 text-xs`}
                            onClick={() => setItemExcluindo(item)}
                            aria-label={`Excluir: ${item.titulo}`}
                          >
                            Excluir
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Modal criar/editar */}
      <ModalFormulario
        open={modalFormAberto}
        itemId={itemEditandoId}
        onClose={fecharForm}
        onSalvo={(msg) => {
          mostrarAviso(msg);
          carregar();
        }}
      />

      {/* Modal excluir */}
      <ModalExcluir
        item={itemExcluindo}
        onClose={() => setItemExcluindo(null)}
        onExcluido={() => {
          mostrarAviso('Conteúdo excluído.');
          carregar();
        }}
      />
    </div>
  );
}
