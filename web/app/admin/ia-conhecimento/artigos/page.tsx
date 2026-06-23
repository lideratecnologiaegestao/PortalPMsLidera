'use client';

/**
 * Módulo "Artigos e Materiais" — conteúdos livres que alimentam o RAG do chatbot.
 * Aceitam texto longo/markdown: materiais de estudo, regimentos, normas, eventos,
 * horários de postos de saúde, etc.
 *
 * Roles com acesso: gestor, admin_prefeitura, ti (verificado no backend + RBAC).
 * WCAG 2.1 AA · tema por tokens CSS · pt-BR.
 *
 * API consumida (exatamente conforme spec):
 *   GET  /api/admin/ia/conteudos?categoria=&secretaria=&q=
 *   GET  /api/admin/ia/conteudos/:id
 *   POST /api/admin/ia/conteudos
 *   PUT  /api/admin/ia/conteudos/:id
 *   DELETE /api/admin/ia/conteudos/:id
 *   GET  /api/secretarias
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
} from '../../../../lib/admin-api';
import { useSessaoAdmin } from '../../../../lib/session-context';
import { escopoRestrito } from '../../../../lib/roles';
import { AdminHeader, Aviso, Modal, ui } from '../../_components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Conteudo {
  id: string;
  titulo: string;
  categoria: string | null;
  tags: string[];
  publico: boolean;
  ativo: boolean;
  secretariaId: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  atualizadoEm: string;
  // conteudo só vem no GET :id
  conteudo?: string;
}

interface Secretaria {
  id: string;
  nome: string;
}

// ─── Categorias sugeridas ─────────────────────────────────────────────────────

const CATEGORIAS_SUGERIDAS = [
  'Educação',
  'Saúde',
  'Eventos',
  'Regimentos',
  'Normas',
  'Assistência Social',
  'Meio Ambiente',
  'Obras e Infraestrutura',
  'Tributos e Finanças',
  'Outros',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isoParaDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return iso.slice(0, 10); // yyyy-mm-dd
  } catch {
    return '';
  }
}

// ─── Editor de Tags (chips add/remove) ───────────────────────────────────────
// Reutiliza o mesmo padrão da aba de Perguntas/Respostas (não depende de cor).

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
        Pressione Enter ou vírgula para adicionar uma tag. Backspace remove a última.
      </span>
    </div>
  );
}

// ─── Formulário (Modal criar/editar) ─────────────────────────────────────────

interface FormState {
  titulo: string;
  categoria: string;
  conteudo: string;
  tags: string[];
  secretariaId: string;
  publico: boolean;
  ativo: boolean;
  vigenciaInicio: string;
  vigenciaFim: string;
}

const FORM_VAZIO: FormState = {
  titulo: '',
  categoria: '',
  conteudo: '',
  tags: [],
  secretariaId: '',
  publico: true,
  ativo: true,
  vigenciaInicio: '',
  vigenciaFim: '',
};

function ModalFormulario({
  open,
  itemId,        // null = novo
  secretarias,
  roleSessao,
  secretariaFixa, // secretaria do usuário com escopo restrito
  onClose,
  onSalvo,
}: {
  open: boolean;
  itemId: string | null;
  secretarias: Secretaria[];
  roleSessao: string;
  secretariaFixa: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const restrito = escopoRestrito(roleSessao);

  const [form, setFormRaw] = useState<FormState>(FORM_VAZIO);
  const formRef = useRef<FormState>(FORM_VAZIO);

  // Mantém ref em sincronia — evita stale closure no submit
  function setForm(next: FormState) {
    formRef.current = next;
    setFormRaw(next);
  }

  const [carregandoItem, setCarregandoItem] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega o item completo (com `conteudo`) ao abrir em modo edição
  useEffect(() => {
    if (!open) return;
    setErro('');
    setSalvando(false);

    if (!itemId) {
      // Novo: pré-preenche secretaria quando há escopo restrito
      setForm({
        ...FORM_VAZIO,
        secretariaId: restrito ? secretariaFixa : '',
        publico: true,
        ativo: true,
      });
      return;
    }

    setCarregandoItem(true);
    adminGet<Conteudo>(`/api/admin/ia/conteudos/${itemId}`)
      .then((item) => {
        setForm({
          titulo: item.titulo,
          categoria: item.categoria ?? '',
          conteudo: item.conteudo ?? '',
          tags: item.tags ?? [],
          secretariaId: item.secretariaId ?? '',
          publico: item.publico,
          ativo: item.ativo,
          vigenciaInicio: isoParaDate(item.vigenciaInicio),
          vigenciaFim: isoParaDate(item.vigenciaFim),
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
  }, [open, itemId, restrito, secretariaFixa]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const f = formRef.current;

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

    try {
      const body: Record<string, unknown> = {
        titulo: f.titulo.trim(),
        conteudo: f.conteudo.trim(),
        categoria: f.categoria.trim() || undefined,
        tags: f.tags,
        secretariaId: f.secretariaId || undefined,
        publico: f.publico,
        ativo: f.ativo,
        vigenciaInicio: f.vigenciaInicio || undefined,
        vigenciaFim: f.vigenciaFim || undefined,
      };

      if (itemId) {
        await adminPut(`/api/admin/ia/conteudos/${itemId}`, body);
      } else {
        await adminPost('/api/admin/ia/conteudos', body);
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

  const tituloModal = itemId ? 'Editar artigo / material' : 'Novo artigo / material';

  return (
    <Modal open={open} onClose={onClose} title={tituloModal}>
      {carregandoItem ? (
        <p className="py-8 text-center text-sm text-fg/60" role="status">
          Carregando conteúdo…
        </p>
      ) : (
        <form onSubmit={salvar} noValidate className="space-y-4">
          {/* Título */}
          <div>
            <label htmlFor={`${idBase}-titulo`} className={ui.label}>
              Título <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-titulo`}
              className={`${ui.input} mt-1`}
              value={form.titulo}
              onChange={(e) => setForm({ ...formRef.current, titulo: e.target.value })}
              required
              aria-required="true"
              placeholder="Ex.: Regimento Interno da Câmara, Calendário Escolar 2025…"
              maxLength={255}
            />
          </div>

          {/* Categoria */}
          <div>
            <label htmlFor={`${idBase}-categoria`} className={ui.label}>
              Categoria
            </label>
            <input
              id={`${idBase}-categoria`}
              list={`${idBase}-categoria-list`}
              className={`${ui.input} mt-1`}
              value={form.categoria}
              onChange={(e) => setForm({ ...formRef.current, categoria: e.target.value })}
              placeholder="Escolha uma sugestão ou digite livremente"
              maxLength={100}
              aria-describedby={`${idBase}-categoria-desc`}
            />
            <datalist id={`${idBase}-categoria-list`}>
              {CATEGORIAS_SUGERIDAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p id={`${idBase}-categoria-desc`} className="mt-0.5 text-xs text-fg/50">
              Usada nos filtros da lista. Pode ser qualquer texto.
            </p>
          </div>

          {/* Conteúdo */}
          <div>
            <label htmlFor={`${idBase}-conteudo`} className={ui.label}>
              Conteúdo <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${idBase}-conteudo`}
              className={`${ui.input} mt-1 min-h-[220px] resize-y font-mono text-xs leading-relaxed`}
              value={form.conteudo}
              onChange={(e) => setForm({ ...formRef.current, conteudo: e.target.value })}
              required
              aria-required="true"
              aria-describedby={`${idBase}-conteudo-desc`}
              placeholder="Cole o texto completo aqui. Aceita Markdown (# Títulos, **negrito**, listas…)"
            />
            <p id={`${idBase}-conteudo-desc`} className="mt-0.5 text-xs text-fg/50">
              Aceita texto longo e Markdown. O assistente usa trechos deste conteúdo ao
              responder os cidadãos.
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

          {/* Secretaria */}
          <div>
            <label htmlFor={`${idBase}-secretaria`} className={ui.label}>
              Secretaria
            </label>
            {restrito ? (
              /* Gestor/servidor: só leitura da própria secretaria */
              <div className="mt-1">
                <input
                  id={`${idBase}-secretaria`}
                  className={`${ui.input} cursor-not-allowed opacity-70`}
                  value={
                    secretarias.find((s) => s.id === secretariaFixa)?.nome ??
                    secretariaFixa
                  }
                  readOnly
                  aria-readonly="true"
                  aria-describedby={`${idBase}-secretaria-desc`}
                />
                <p id={`${idBase}-secretaria-desc`} className="mt-0.5 text-xs text-fg/50">
                  Conteúdo vinculado à sua secretaria.
                </p>
              </div>
            ) : (
              <select
                id={`${idBase}-secretaria`}
                className={`${ui.input} mt-1`}
                value={form.secretariaId}
                onChange={(e) =>
                  setForm({ ...formRef.current, secretariaId: e.target.value })
                }
                aria-describedby={`${idBase}-secretaria-desc`}
              >
                <option value="">— Nenhuma (geral) —</option>
                {secretarias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            )}
            {!restrito && (
              <p id={`${idBase}-secretaria-desc`} className="mt-0.5 text-xs text-fg/50">
                Opcional. Vincula o conteúdo a uma secretaria para filtros.
              </p>
            )}
          </div>

          {/* Vigência */}
          <fieldset className="rounded border border-border p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">
              Vigência{' '}
              <span className="font-normal">(opcional — para conteúdo temporário)</span>
            </legend>
            <p className="text-xs text-fg/50">
              Use para eventos, avisos sazonais ou normas com prazo. Conteúdo vencido
              pode ser desativado automaticamente pelo sistema.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${idBase}-vigencia-inicio`} className={ui.label}>
                  Início
                </label>
                <input
                  id={`${idBase}-vigencia-inicio`}
                  type="date"
                  className={`${ui.input} mt-1`}
                  value={form.vigenciaInicio}
                  onChange={(e) =>
                    setForm({ ...formRef.current, vigenciaInicio: e.target.value })
                  }
                  aria-label="Data de início da vigência"
                />
              </div>
              <div>
                <label htmlFor={`${idBase}-vigencia-fim`} className={ui.label}>
                  Fim
                </label>
                <input
                  id={`${idBase}-vigencia-fim`}
                  type="date"
                  className={`${ui.input} mt-1`}
                  value={form.vigenciaFim}
                  min={form.vigenciaInicio || undefined}
                  onChange={(e) =>
                    setForm({ ...formRef.current, vigenciaFim: e.target.value })
                  }
                  aria-label="Data de fim da vigência"
                />
              </div>
            </div>
          </fieldset>

          {/* Toggles publico / ativo */}
          <fieldset className="space-y-2 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Visibilidade</legend>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.publico}
                onChange={(e) =>
                  setForm({ ...formRef.current, publico: e.target.checked })
                }
                className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                aria-describedby={`${idBase}-publico-desc`}
              />
              <span className="text-sm font-semibold">Público</span>
            </label>
            <p id={`${idBase}-publico-desc`} className="ml-6 text-xs text-fg/50">
              Quando ligado, o assistente pode usar este conteúdo para responder
              cidadãos no chat do portal.
            </p>

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
              Conteúdo inativo é ignorado pelo assistente e não aparece na busca.
            </p>
          </fieldset>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={ui.btn}>
              {salvando ? 'Salvando…' : itemId ? 'Salvar alterações' : 'Adicionar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Modal de Exclusão ────────────────────────────────────────────────────────

function ModalExcluir({
  item,
  onClose,
  onExcluido,
}: {
  item: Conteudo | null;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  // Limpa estado ao fechar — evita estado "sujo" no próximo item
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
      await adminDelete(`/api/admin/ia/conteudos/${item.id}`);
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
    <Modal open={item !== null} onClose={onClose} title="Excluir artigo / material">
      <div className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {item && (
          <p className="text-sm">
            Deseja excluir{' '}
            <strong>
              &quot;
              {item.titulo.length > 80 ? item.titulo.slice(0, 80) + '…' : item.titulo}
              &quot;
            </strong>
            ? Esta ação não pode ser desfeita e o conteúdo será removido da busca do
            assistente.
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

export default function ArtigosMaterialsPage() {
  const { role: roleSessao } = useSessaoAdmin();
  const restrito = escopoRestrito(roleSessao);

  // Dados
  const [lista, setLista] = useState<Conteudo[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroSecretaria, setFiltroSecretaria] = useState('');
  const [filtroQ, setFiltroQ] = useState('');

  // Modais
  const [modalFormAberto, setModalFormAberto] = useState(false);
  const [itemEditandoId, setItemEditandoId] = useState<string | null>(null);
  const [itemExcluindo, setItemExcluindo] = useState<Conteudo | null>(null);

  // secretariaId fixo para gestor/servidor (vem do perfil; por simplicidade
  // usamos o ID da secretaria do primeiro item carregado; backend já filtra via RLS)
  const [secretariaFixa, setSecretariaFixa] = useState('');

  // Carrega secretarias uma única vez
  useEffect(() => {
    adminGet<Secretaria[]>('/api/secretarias')
      .then(setSecretarias)
      .catch(() => {/* silencioso — select fica vazio */});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params: Record<string, string> = {};
      if (filtroCategoria) params.categoria = filtroCategoria;
      if (filtroSecretaria) params.secretaria = filtroSecretaria;
      if (filtroQ) params.q = filtroQ;

      const dados = await adminGet<Conteudo[]>(
        `/api/admin/ia/conteudos${qs(params)}`,
      );
      setLista(dados);

      // Detecta secretaria fixa para gestores (primeiro item com secretariaId)
      if (restrito && !secretariaFixa) {
        const primeiro = dados.find((d) => d.secretariaId);
        if (primeiro?.secretariaId) setSecretariaFixa(primeiro.secretariaId);
      }
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao carregar os artigos.',
      );
    } finally {
      setCarregando(false);
    }
  }, [filtroCategoria, filtroSecretaria, filtroQ, restrito, secretariaFixa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(''), 3500);
  }

  function abrirNovo() {
    setItemEditandoId(null);
    setModalFormAberto(true);
  }

  function abrirEditar(item: Conteudo) {
    setItemEditandoId(item.id);
    setModalFormAberto(true);
  }

  function fecharForm() {
    setModalFormAberto(false);
    // Limpa id DEPOIS de fechar para não causar flash de "modo novo"
    setTimeout(() => setItemEditandoId(null), 200);
  }

  // Derivado: nome da secretaria pelo ID
  function nomeSecretaria(id: string | null): string {
    if (!id) return '';
    return secretarias.find((s) => s.id === id)?.nome ?? id;
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <AdminHeader
        title="Artigos e Materiais"
        description="Conteúdos que a IA do chat usa para responder os cidadãos."
      >
        <button className={ui.btn} onClick={abrirNovo} aria-label="Adicionar novo artigo ou material">
          + Novo artigo
        </button>
      </AdminHeader>

      {/* Texto de ajuda */}
      <aside
        className="rounded border border-primary/20 bg-primary/5 p-4 text-sm text-fg/80"
        aria-label="Como funciona"
      >
        <p>
          <strong>Como funciona:</strong> adicione textos que a IA do chat usará para
          responder os cidadãos — por exemplo: materiais de estudo, regimentos,
          normas de saúde, horários de postos, eventos. O conteúdo entra na busca
          semântica do assistente. Aceita texto longo e Markdown.
        </p>
      </aside>

      {/* Feedback */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-wrap gap-3">
        {/* Busca textual */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <label htmlFor="filtro-q" className="sr-only">
            Buscar por título ou conteúdo
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
            placeholder="Buscar…"
            className={`${ui.input} pl-9`}
          />
        </div>

        {/* Categoria */}
        <div className="min-w-[160px]">
          <label htmlFor="filtro-categoria" className="sr-only">
            Filtrar por categoria
          </label>
          <input
            id="filtro-categoria"
            list="filtro-categoria-list"
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            placeholder="Categoria…"
            className={ui.input}
          />
          <datalist id="filtro-categoria-list">
            {CATEGORIAS_SUGERIDAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Secretaria — oculto para gestor/servidor (já filtrado pelo backend via RLS) */}
        {!restrito && (
          <div className="min-w-[180px]">
            <label htmlFor="filtro-secretaria" className="sr-only">
              Filtrar por secretaria
            </label>
            <select
              id="filtro-secretaria"
              value={filtroSecretaria}
              onChange={(e) => setFiltroSecretaria(e.target.value)}
              className={ui.input}
            >
              <option value="">Todas as secretarias</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Limpar filtros */}
        {(filtroQ || filtroCategoria || filtroSecretaria) && (
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => {
              setFiltroQ('');
              setFiltroCategoria('');
              setFiltroSecretaria('');
            }}
            aria-label="Limpar todos os filtros"
          >
            Limpar filtros
          </button>
        )}
      </section>

      {/* Lista */}
      <section aria-label="Artigos e materiais" aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-12 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-fg/60">
              {filtroQ || filtroCategoria || filtroSecretaria
                ? 'Nenhum artigo encontrado para os filtros aplicados.'
                : 'Nenhum artigo cadastrado. Adicione o primeiro para treinar o assistente.'}
            </p>
            {!filtroQ && !filtroCategoria && !filtroSecretaria && (
              <button onClick={abrirNovo} className={ui.btn}>
                Adicionar primeiro artigo
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-fg/40" aria-live="polite">
              {lista.length} artigo(s) encontrado(s)
            </p>
            <ul role="list" className="space-y-3">
              {lista.map((item) => (
                <li
                  key={item.id}
                  className={[
                    'rounded border bg-bg p-4 transition-colors',
                    !item.ativo ? 'opacity-60 border-border' : 'border-border hover:border-primary/30',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Conteúdo do card */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Badges de status */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.categoria && (
                          <span className={`${ui.badge} bg-secondary/10 text-secondary`}>
                            {item.categoria}
                          </span>
                        )}
                        {item.publico ? (
                          <span className={`${ui.badge} bg-success/10 text-success`}>
                            Público
                          </span>
                        ) : (
                          <span className={`${ui.badge} bg-muted text-fg/50`}>
                            Restrito
                          </span>
                        )}
                        {!item.ativo && (
                          <span className={`${ui.badge} bg-muted text-fg/50`}>
                            Inativo
                          </span>
                        )}
                        {/* Vigência */}
                        {(item.vigenciaInicio || item.vigenciaFim) && (
                          <span
                            className={`${ui.badge} bg-warning/10 text-fg/70`}
                            aria-label={`Vigência: ${item.vigenciaInicio ? 'de ' + formatarData(item.vigenciaInicio) : ''} ${item.vigenciaFim ? 'até ' + formatarData(item.vigenciaFim) : ''}`}
                          >
                            {item.vigenciaInicio && !item.vigenciaFim
                              ? `Desde ${formatarData(item.vigenciaInicio)}`
                              : !item.vigenciaInicio && item.vigenciaFim
                              ? `Até ${formatarData(item.vigenciaFim)}`
                              : `${formatarData(item.vigenciaInicio)} – ${formatarData(item.vigenciaFim)}`}
                          </span>
                        )}
                      </div>

                      {/* Título */}
                      <p className="font-semibold text-fg">{item.titulo}</p>

                      {/* Secretaria */}
                      {item.secretariaId && (
                        <p className="text-xs text-fg/60">
                          {nomeSecretaria(item.secretariaId)}
                        </p>
                      )}

                      {/* Tags */}
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5" aria-label="Tags">
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

                      {/* Meta */}
                      <p className="text-xs text-fg/40">
                        Atualizado em {formatarData(item.atualizadoEm)}
                      </p>
                    </div>

                    {/* Ações */}
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => abrirEditar(item)}
                        aria-label={`Editar artigo: ${item.titulo}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={ui.btnDanger}
                        onClick={() => setItemExcluindo(item)}
                        aria-label={`Excluir artigo: ${item.titulo}`}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Modal criar/editar */}
      <ModalFormulario
        open={modalFormAberto}
        itemId={itemEditandoId}
        secretarias={secretarias}
        roleSessao={roleSessao}
        secretariaFixa={secretariaFixa}
        onClose={fecharForm}
        onSalvo={() => {
          mostrarAviso(
            itemEditandoId ? 'Artigo atualizado com sucesso.' : 'Artigo adicionado com sucesso.',
          );
          carregar();
        }}
      />

      {/* Modal excluir */}
      <ModalExcluir
        item={itemExcluindo}
        onClose={() => setItemExcluindo(null)}
        onExcluido={() => {
          mostrarAviso('Artigo excluído.');
          carregar();
        }}
      />
    </div>
  );
}
