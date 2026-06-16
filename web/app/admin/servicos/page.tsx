'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminApiError,
  Pagina,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import {
  AdminHeader,
  Aviso,
  Modal,
  ui,
} from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Etapa {
  titulo: string;
  descricao: string;
}

interface Servico {
  id: string;
  titulo: string;
  slug: string;
  descricao: string;
  categoria: string;
  orgaoResponsavel: string;
  publicoAlvo: string;
  requisitos: string;
  etapas: Etapa[];
  canaisAtendimento: string;
  prazoAtendimento: string;
  custo: string;
  urlExterna: string;
  publicado: boolean;
  destaque: boolean;
  ordem: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORIAS = [
  'Saúde',
  'Educação',
  'Habitação',
  'Assistência Social',
  'Meio Ambiente',
  'Tributário',
  'Obras e Urbanismo',
  'Transporte',
  'Cultura e Lazer',
  'Segurança',
  'Outros',
];

/** Valores padronizados de público-alvo (espelho do backend). */
const PUBLICOS_ALVO = ['Cidadão', 'Empresa', 'Servidor', 'Outro'] as const;

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const SERVICO_VAZIO: Omit<Servico, 'id'> = {
  titulo: '',
  slug: '',
  descricao: '',
  categoria: '',
  orgaoResponsavel: '',
  publicoAlvo: '',
  requisitos: '',
  etapas: [],
  canaisAtendimento: '',
  prazoAtendimento: '',
  custo: '',
  urlExterna: '',
  publicado: false,
  destaque: false,
  ordem: 0,
};

// ---------------------------------------------------------------------------
// Sub-componente: Formulário de etapas
// ---------------------------------------------------------------------------

function EtapasEditor({
  etapas,
  onChange,
}: {
  etapas: Etapa[];
  onChange: (etapas: Etapa[]) => void;
}) {
  const idBase = useId();

  function adicionar() {
    onChange([...etapas, { titulo: '', descricao: '' }]);
  }

  function remover(i: number) {
    onChange(etapas.filter((_, idx) => idx !== i));
  }

  function atualizar(i: number, campo: keyof Etapa, valor: string) {
    const copia = etapas.map((e, idx) =>
      idx === i ? { ...e, [campo]: valor } : e,
    );
    onChange(copia);
  }

  return (
    <fieldset className="space-y-3">
      <legend className={`${ui.label} mb-1`}>Etapas do serviço</legend>
      {etapas.length === 0 && (
        <p className="text-sm text-fg/60">Nenhuma etapa cadastrada.</p>
      )}
      {etapas.map((etapa, i) => (
        <div key={i} className={`${ui.card} p-3 space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg/60">
              Etapa {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remover(i)}
              className={ui.btnDanger}
              aria-label={`Remover etapa ${i + 1}`}
            >
              Remover
            </button>
          </div>
          <div>
            <label
              htmlFor={`${idBase}-etapa-${i}-titulo`}
              className={ui.label}
            >
              Título da etapa
            </label>
            <input
              id={`${idBase}-etapa-${i}-titulo`}
              className={`${ui.input} mt-1`}
              value={etapa.titulo}
              onChange={(e) => atualizar(i, 'titulo', e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor={`${idBase}-etapa-${i}-descricao`}
              className={ui.label}
            >
              Descrição da etapa
            </label>
            <textarea
              id={`${idBase}-etapa-${i}-descricao`}
              className={`${ui.input} mt-1`}
              rows={2}
              value={etapa.descricao}
              onChange={(e) => atualizar(i, 'descricao', e.target.value)}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={adicionar}
        className={ui.btnGhost}
      >
        + Adicionar etapa
      </button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Modal de formulário
// ---------------------------------------------------------------------------

function FormServico({
  open,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: Servico | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<Omit<Servico, 'id'>>(SERVICO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const slugManual = useRef(false);

  // Inicializa o form ao abrir
  useEffect(() => {
    if (!open) return;
    setErro('');
    slugManual.current = false;
    if (editando) {
      const { id: _id, ...campos } = editando;
      setForm(campos);
      slugManual.current = true; // em edição não sobrescreve o slug
    } else {
      setForm(SERVICO_VAZIO);
    }
  }, [open, editando]);

  function campo<K extends keyof Omit<Servico, 'id'>>(
    k: K,
    val: Omit<Servico, 'id'>[K],
  ) {
    setForm((prev) => ({ ...prev, [k]: val }));
  }

  function handleTitulo(v: string) {
    setForm((prev) => ({
      ...prev,
      titulo: v,
      slug: slugManual.current ? prev.slug : slugify(v),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await adminPut(`/api/admin/servicos/${editando.id}`, form);
      } else {
        await adminPost('/api/admin/servicos', form);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar serviço' : 'Novo serviço'}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Título */}
        <div>
          <label htmlFor={`${idBase}-titulo`} className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-titulo`}
            className={`${ui.input} mt-1`}
            value={form.titulo}
            onChange={(e) => handleTitulo(e.target.value)}
            required
            aria-required="true"
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor={`${idBase}-slug`} className={ui.label}>
            Slug <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-slug`}
            className={`${ui.input} mt-1`}
            value={form.slug}
            onChange={(e) => {
              slugManual.current = true;
              campo('slug', e.target.value);
            }}
            required
            aria-required="true"
            pattern="[a-z0-9\-]+"
            aria-describedby={`${idBase}-slug-hint`}
          />
          <p id={`${idBase}-slug-hint`} className="mt-1 text-xs text-fg/60">
            Gerado automaticamente a partir do título. Somente letras minúsculas, números e hífens.
          </p>
        </div>

        {/* Descrição */}
        <div>
          <label htmlFor={`${idBase}-descricao`} className={ui.label}>
            Descrição
          </label>
          <textarea
            id={`${idBase}-descricao`}
            className={`${ui.input} mt-1`}
            rows={3}
            value={form.descricao}
            onChange={(e) => campo('descricao', e.target.value)}
          />
        </div>

        {/* Categoria */}
        <div>
          <label htmlFor={`${idBase}-categoria`} className={ui.label}>
            Categoria <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${idBase}-categoria`}
            className={`${ui.input} mt-1`}
            value={form.categoria}
            onChange={(e) => campo('categoria', e.target.value)}
            required
            aria-required="true"
          >
            <option value="">Selecione…</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Órgão responsável */}
        <div>
          <label htmlFor={`${idBase}-orgao`} className={ui.label}>
            Órgão responsável
          </label>
          <input
            id={`${idBase}-orgao`}
            className={`${ui.input} mt-1`}
            value={form.orgaoResponsavel}
            onChange={(e) => campo('orgaoResponsavel', e.target.value)}
          />
        </div>

        {/* Público-alvo */}
        <div>
          <label htmlFor={`${idBase}-publico`} className={ui.label}>
            Público-alvo
          </label>
          <select
            id={`${idBase}-publico`}
            className={`${ui.input} mt-1`}
            value={
              (PUBLICOS_ALVO as readonly string[]).includes(form.publicoAlvo)
                ? form.publicoAlvo
                : form.publicoAlvo
                ? 'Outro'
                : ''
            }
            onChange={(e) => campo('publicoAlvo', e.target.value)}
          >
            <option value="">Selecione…</option>
            {PUBLICOS_ALVO.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg/60">
            Selecione o público que se beneficia deste serviço.
          </p>
        </div>

        {/* Requisitos */}
        <div>
          <label htmlFor={`${idBase}-requisitos`} className={ui.label}>
            Requisitos
          </label>
          <textarea
            id={`${idBase}-requisitos`}
            className={`${ui.input} mt-1`}
            rows={2}
            value={form.requisitos}
            onChange={(e) => campo('requisitos', e.target.value)}
          />
        </div>

        {/* Etapas */}
        <EtapasEditor
          etapas={form.etapas}
          onChange={(etapas) => campo('etapas', etapas)}
        />

        {/* Canais de atendimento */}
        <div>
          <label htmlFor={`${idBase}-canais`} className={ui.label}>
            Canais de atendimento
          </label>
          <input
            id={`${idBase}-canais`}
            className={`${ui.input} mt-1`}
            value={form.canaisAtendimento}
            onChange={(e) => campo('canaisAtendimento', e.target.value)}
          />
        </div>

        {/* Prazo */}
        <div>
          <label htmlFor={`${idBase}-prazo`} className={ui.label}>
            Prazo de atendimento
          </label>
          <input
            id={`${idBase}-prazo`}
            className={`${ui.input} mt-1`}
            value={form.prazoAtendimento}
            onChange={(e) => campo('prazoAtendimento', e.target.value)}
          />
        </div>

        {/* Custo */}
        <div>
          <label htmlFor={`${idBase}-custo`} className={ui.label}>
            Custo
          </label>
          <input
            id={`${idBase}-custo`}
            className={`${ui.input} mt-1`}
            value={form.custo}
            onChange={(e) => campo('custo', e.target.value)}
            placeholder="Gratuito"
          />
        </div>

        {/* URL externa */}
        <div>
          <label htmlFor={`${idBase}-url`} className={ui.label}>
            URL externa
          </label>
          <input
            id={`${idBase}-url`}
            type="url"
            className={`${ui.input} mt-1`}
            value={form.urlExterna}
            onChange={(e) => campo('urlExterna', e.target.value)}
            placeholder="https://…"
          />
        </div>

        {/* Ordem */}
        <div>
          <label htmlFor={`${idBase}-ordem`} className={ui.label}>
            Ordem de exibição
          </label>
          <input
            id={`${idBase}-ordem`}
            type="number"
            min={0}
            className={`${ui.input} mt-1`}
            value={form.ordem}
            onChange={(e) => campo('ordem', Number(e.target.value))}
          />
        </div>

        {/* Publicado */}
        <div className="flex items-center gap-2">
          <input
            id={`${idBase}-publicado`}
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
            checked={form.publicado}
            onChange={(e) => campo('publicado', e.target.checked)}
          />
          <label htmlFor={`${idBase}-publicado`} className={ui.label}>
            Publicado (aparece na Carta de Serviços)
          </label>
        </div>

        {/* Destaque na home */}
        <div className="flex items-center gap-2">
          <input
            id={`${idBase}-destaque`}
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
            checked={form.destaque}
            onChange={(e) => campo('destaque', e.target.checked)}
          />
          <label htmlFor={`${idBase}-destaque`} className={ui.label}>
            Destaque na página inicial
          </label>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function ServicosAdminPage() {
  const [pagina, setPagina] = useState<Pagina<Servico> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('');
  const [publicado, setPublicado] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Servico | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<Servico>>(
        `/api/admin/servicos${qs({ q, categoria, publicado, page, pageSize: PAGE_SIZE })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar serviços.');
    } finally {
      setCarregando(false);
    }
  }, [q, categoria, publicado, page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  // Ao mudar filtros, volta para a página 1
  function aplicarFiltros() {
    setPage(1);
    buscar();
  }

  async function carregarModelo() {
    if (!window.confirm('Carregar o modelo padrão de serviços municipais? Os serviços que já existirem (mesmo título) não serão duplicados.')) return;
    setErro('');
    try {
      const r = await adminPost<{ criados: number; total: number }>('/api/admin/servicos/seed-modelo', {});
      window.alert(`Modelo carregado: ${r.criados} novo(s) serviço(s) adicionado(s).`);
      setPage(1);
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao carregar o modelo.');
    }
  }

  async function excluir(servico: Servico) {
    if (!window.confirm(`Excluir o serviço "${servico.titulo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminDelete(`/api/admin/servicos/${servico.id}`);
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir.');
    }
  }

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEditar(servico: Servico) {
    setEditando(servico);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Carta de Serviços"
        description="Gerencie os serviços municipais ofertados ao cidadão."
      >
        <button onClick={carregarModelo} className={ui.btnGhost}>
          Carregar modelo padrão
        </button>
        <button onClick={abrirNovo} className={ui.btn}>
          + Novo serviço
        </button>
      </AdminHeader>

      {/* Filtros */}
      <section aria-label="Filtros de busca" className={`${ui.card} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="filtro-q" className={ui.label}>
              Buscar
            </label>
            <input
              id="filtro-q"
              className={`${ui.input} mt-1`}
              placeholder="Título do serviço…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
            />
          </div>
          <div className="min-w-40">
            <label htmlFor="filtro-categoria" className={ui.label}>
              Categoria
            </label>
            <select
              id="filtro-categoria"
              className={`${ui.input} mt-1`}
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); setPage(1); }}
            >
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-36">
            <label htmlFor="filtro-publicado" className={ui.label}>
              Publicado
            </label>
            <select
              id="filtro-publicado"
              className={`${ui.input} mt-1`}
              value={publicado}
              onChange={(e) => { setPublicado(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <button onClick={aplicarFiltros} className={ui.btn}>
            Buscar
          </button>
        </div>
      </section>

      {/* Mensagem de erro global */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section aria-label="Lista de serviços" aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum serviço encontrado.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Categoria</th>
                  <th className={ui.th} scope="col">Publicado</th>
                  <th className={ui.th} scope="col">Ordem</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((s) => (
                  <tr key={s.id}>
                    <td className={ui.td}>
                      <span className="font-semibold">{s.titulo}</span>
                      {s.slug && (
                        <span className="block text-xs text-fg/50">/{s.slug}</span>
                      )}
                    </td>
                    <td className={ui.td}>{s.categoria || '—'}</td>
                    <td className={ui.td}>
                      {s.publicado ? (
                        <span className={`${ui.badge} bg-success/20 text-success`}>
                          Sim
                        </span>
                      ) : (
                        <span className={`${ui.badge} bg-muted text-fg/60`}>
                          Não
                        </span>
                      )}
                    </td>
                    <td className={ui.td}>{s.ordem}</td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEditar(s)}
                          className={ui.btnGhost}
                          aria-label={`Editar serviço ${s.titulo}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => excluir(s)}
                          className={ui.btnDanger}
                          aria-label={`Excluir serviço ${s.titulo}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paginação */}
      {pagina && pagina.total > PAGE_SIZE && (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="text-fg/60">
            Página {page} de {totalPaginas} — {pagina.total} registro(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={ui.btnGhost}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
              className={ui.btnGhost}
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>
        </nav>
      )}

      {/* Modal de criação/edição */}
      <FormServico
        open={modalAberto}
        editando={editando}
        onClose={fecharModal}
        onSalvo={buscar}
      />
    </main>
  );
}
