'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  Pagina,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type CategoriaValue =
  | 'ppa'
  | 'ldo'
  | 'loa'
  | 'rgf'
  | 'rreo'
  | 'balanco_geral'
  | 'prestacao_contas'
  | 'regulamento_lai'
  | 'relatorio_estatistico_sic'
  | 'carta_servicos'
  | 'plano_contratacoes'
  | 'edital_licitacao'
  | 'contrato'
  | 'concurso';

interface Documento {
  id: string;
  categoria: CategoriaValue;
  exercicio: number | null;
  periodo: string | null;
  titulo: string;
  urlExterna: string | null;
}

interface SyncLog {
  id: string;
  dataset: string;
  origem: string;
  registros: number;
  status: string;
  criadoEm: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORIAS: { value: CategoriaValue; label: string }[] = [
  { value: 'ppa', label: 'PPA' },
  { value: 'ldo', label: 'LDO' },
  { value: 'loa', label: 'LOA' },
  { value: 'rgf', label: 'RGF' },
  { value: 'rreo', label: 'RREO' },
  { value: 'balanco_geral', label: 'Balanço Geral' },
  { value: 'prestacao_contas', label: 'Prestação de Contas' },
  { value: 'regulamento_lai', label: 'Regulamento da LAI' },
  { value: 'relatorio_estatistico_sic', label: 'Relatório e-SIC' },
  { value: 'carta_servicos', label: 'Carta de Serviços' },
  { value: 'plano_contratacoes', label: 'Plano de Contratações' },
  { value: 'edital_licitacao', label: 'Edital de Licitação' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'concurso', label: 'Concurso' },
];

function rotuloCategoria(value: string): string {
  return CATEGORIAS.find((c) => c.value === value)?.label ?? value;
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function badgeSync(status: string): string {
  if (status === 'ok' || status === 'sucesso') return 'bg-success/20 text-success';
  if (status === 'erro' || status === 'falha') return 'bg-danger/20 text-danger';
  return 'bg-muted text-fg/60';
}

// ---------------------------------------------------------------------------
// Modal: Criar / Editar documento
// ---------------------------------------------------------------------------

interface FormDocumento {
  titulo: string;
  categoria: CategoriaValue;
  exercicio: string;
  periodo: string;
  urlExterna: string;
}

function formVazio(): FormDocumento {
  return { titulo: '', categoria: 'ppa', exercicio: '', periodo: '', urlExterna: '' };
}

function docParaForm(doc: Documento): FormDocumento {
  return {
    titulo: doc.titulo,
    categoria: doc.categoria,
    exercicio: doc.exercicio != null ? String(doc.exercicio) : '',
    periodo: doc.periodo ?? '',
    urlExterna: doc.urlExterna ?? '',
  };
}

function ModalDocumento({
  open,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: Documento | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormDocumento>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [pickerAberto, setPickerAberto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setForm(editando ? docParaForm(editando) : formVazio());
  }, [open, editando]);

  function campo<K extends keyof FormDocumento>(k: K, v: FormDocumento[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      setErro('O título é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const body = {
        titulo: form.titulo.trim(),
        categoria: form.categoria,
        exercicio: form.exercicio ? Number(form.exercicio) : undefined,
        periodo: form.periodo.trim() || undefined,
        urlExterna: form.urlExterna.trim() || undefined,
      };
      if (editando) {
        await adminPatch(`/api/admin/transparencia/documentos/${editando.id}`, body);
      } else {
        await adminPost('/api/admin/transparencia/documentos', body);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = editando ? 'Editar documento' : 'Novo documento';

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
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
            onChange={(e) => campo('titulo', e.target.value)}
            required
            aria-required="true"
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
            onChange={(e) => campo('categoria', e.target.value as CategoriaValue)}
            required
            aria-required="true"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Exercício + Período */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idBase}-exercicio`} className={ui.label}>
              Exercício (ano)
            </label>
            <input
              id={`${idBase}-exercicio`}
              type="number"
              min="2000"
              max="2100"
              className={`${ui.input} mt-1`}
              value={form.exercicio}
              onChange={(e) => campo('exercicio', e.target.value)}
              aria-describedby={`${idBase}-exercicio-hint`}
            />
            <p id={`${idBase}-exercicio-hint`} className="mt-1 text-xs text-fg/60">
              Ex.: 2024
            </p>
          </div>
          <div>
            <label htmlFor={`${idBase}-periodo`} className={ui.label}>
              Período
            </label>
            <input
              id={`${idBase}-periodo`}
              className={`${ui.input} mt-1`}
              placeholder="Ex.: 1º Bimestre"
              value={form.periodo}
              onChange={(e) => campo('periodo', e.target.value)}
            />
          </div>
        </div>

        {/* Arquivo do documento (Biblioteca de Mídia) ou URL externa */}
        <div>
          <label htmlFor={`${idBase}-url`} className={ui.label}>
            Arquivo do documento
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${idBase}-url`}
              type="url"
              className={`${ui.input} flex-1`}
              placeholder="https://… ou envie um arquivo"
              value={form.urlExterna}
              onChange={(e) => campo('urlExterna', e.target.value)}
            />
            <button
              type="button"
              onClick={() => setPickerAberto(true)}
              className={ui.btnGhost}
            >
              Biblioteca…
            </button>
          </div>
          <p className="mt-1 text-xs text-fg/60">
            Envie o PDF oficial pela Biblioteca de Mídia ou informe a URL pública.
            Documentos sem arquivo válido não contam para a conformidade PNTP.
          </p>
          {form.urlExterna && (
            <a
              href={form.urlExterna}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-primary underline"
            >
              Conferir documento
            </a>
          )}
        </div>

        <MediaPicker
          open={pickerAberto}
          tipo="documento"
          onClose={() => setPickerAberto(false)}
          onSelect={(asset) => {
            if (asset.urlPublica) campo('urlExterna', asset.urlPublica);
          }}
        />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar documento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Seção A: Documentos
// ---------------------------------------------------------------------------

function SecaoDocumentos() {
  const [pagina, setPagina] = useState<Pagina<Documento> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroExercicio, setFiltroExercicio] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Documento | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<Documento>>(
        `/api/admin/transparencia/documentos${qs({
          categoria: filtroCategoria,
          exercicio: filtroExercicio,
          page,
          pageSize: PAGE_SIZE,
        })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar documentos.');
    } finally {
      setCarregando(false);
    }
  }, [filtroCategoria, filtroExercicio, page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function excluir(doc: Documento) {
    if (!window.confirm(`Excluir o documento "${doc.titulo}"? Esta ação é irreversível.`)) return;
    setErro('');
    try {
      await adminDelete(`/api/admin/transparencia/documentos/${doc.id}`);
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir documento.');
    }
  }

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEditar(doc: Documento) {
    setEditando(doc);
    setModalAberto(true);
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  return (
    <section aria-label="Documentos de transparência" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Documentos</h2>
        <button onClick={abrirNovo} className={ui.btn}>
          + Novo documento
        </button>
      </div>

      {/* Filtros */}
      <div className={`${ui.card} p-4`}>
        <fieldset>
          <legend className="sr-only">Filtros de documentos</legend>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label htmlFor="filtro-cat" className={ui.label}>
                Categoria
              </label>
              <select
                id="filtro-cat"
                className={`${ui.input} mt-1`}
                value={filtroCategoria}
                onChange={(e) => { setFiltroCategoria(e.target.value); setPage(1); }}
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-36">
              <label htmlFor="filtro-exercicio" className={ui.label}>
                Exercício
              </label>
              <input
                id="filtro-exercicio"
                type="number"
                min="2000"
                max="2100"
                placeholder="Ex.: 2024"
                className={`${ui.input} mt-1`}
                value={filtroExercicio}
                onChange={(e) => { setFiltroExercicio(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </fieldset>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <div
        aria-label="Lista de documentos"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum documento encontrado.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Categoria</th>
                  <th className={ui.th} scope="col">Exercício</th>
                  <th className={ui.th} scope="col">Link</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((doc) => (
                  <tr key={doc.id}>
                    <td className={ui.td}>
                      <span className="font-medium">{doc.titulo}</span>
                      {doc.periodo && (
                        <span className="ml-1 text-xs text-fg/60">({doc.periodo})</span>
                      )}
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} bg-primary/10 text-primary`}>
                        {rotuloCategoria(doc.categoria)}
                      </span>
                    </td>
                    <td className={ui.td}>{doc.exercicio ?? '—'}</td>
                    <td className={ui.td}>
                      {doc.urlExterna ? (
                        <a
                          href={doc.urlExterna}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline hover:opacity-80"
                          aria-label={`Abrir documento ${doc.titulo} (abre em nova aba)`}
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-fg/40">—</span>
                      )}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEditar(doc)}
                          className={ui.btnGhost}
                          aria-label={`Editar documento ${doc.titulo}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => excluir(doc)}
                          className={ui.btnDanger}
                          aria-label={`Excluir documento ${doc.titulo}`}
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
      </div>

      {/* Paginação */}
      {pagina && pagina.total > PAGE_SIZE && (
        <nav aria-label="Paginação de documentos" className="flex items-center justify-between gap-2 text-sm">
          <span className="text-fg/60">
            Página {page} de {totalPaginas} — {pagina.total} documento(s)
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

      <ModalDocumento
        open={modalAberto}
        editando={editando}
        onClose={() => setModalAberto(false)}
        onSalvo={buscar}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Seção B: Histórico de sincronização
// ---------------------------------------------------------------------------

function SecaoSyncLog() {
  const [pagina, setPagina] = useState<Pagina<SyncLog> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<SyncLog>>(
        `/api/admin/transparencia/sync-log${qs({ page, pageSize: PAGE_SIZE })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar histórico.');
    } finally {
      setCarregando(false);
    }
  }, [page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  return (
    <section aria-label="Histórico de sincronização" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Histórico de Sincronização</h2>
        <button onClick={buscar} className={ui.btnGhost} aria-label="Atualizar histórico">
          Atualizar
        </button>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div
        aria-label="Log de sincronizações"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhuma sincronização registrada.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Dataset</th>
                  <th className={ui.th} scope="col">Origem</th>
                  <th className={ui.th} scope="col">Registros</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Data</th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((log) => (
                  <tr key={log.id}>
                    <td className={ui.td}>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{log.dataset}</code>
                    </td>
                    <td className={ui.td}>{log.origem}</td>
                    <td className={`${ui.td} tabular-nums`}>{log.registros.toLocaleString('pt-BR')}</td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} ${badgeSync(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <time dateTime={log.criadoEm}>{formatarData(log.criadoEm)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagina && pagina.total > PAGE_SIZE && (
        <nav aria-label="Paginação do histórico" className="flex items-center justify-between gap-2 text-sm">
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Página principal — abas
// ---------------------------------------------------------------------------

type Aba = 'documentos' | 'sync';

export default function TransparenciaAdminPage() {
  const [aba, setAba] = useState<Aba>('documentos');

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Transparência"
        description="Gerencie documentos de transparência pública e acompanhe o histórico de sincronização."
      />

      {/* Abas de navegação */}
      <nav aria-label="Seções de transparência" role="tablist" className="flex gap-1 border-b border-border">
        <button
          role="tab"
          aria-selected={aba === 'documentos'}
          aria-controls="painel-documentos"
          id="tab-documentos"
          onClick={() => setAba('documentos')}
          className={`px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
            ${aba === 'documentos'
              ? 'border-b-2 border-primary text-primary'
              : 'text-fg/60 hover:text-fg'
            }`}
        >
          Documentos
        </button>
        <button
          role="tab"
          aria-selected={aba === 'sync'}
          aria-controls="painel-sync"
          id="tab-sync"
          onClick={() => setAba('sync')}
          className={`px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
            ${aba === 'sync'
              ? 'border-b-2 border-primary text-primary'
              : 'text-fg/60 hover:text-fg'
            }`}
        >
          Sincronização
        </button>
      </nav>

      {/* Painéis */}
      <div
        id="painel-documentos"
        role="tabpanel"
        aria-labelledby="tab-documentos"
        hidden={aba !== 'documentos'}
      >
        {aba === 'documentos' && <SecaoDocumentos />}
      </div>
      <div
        id="painel-sync"
        role="tabpanel"
        aria-labelledby="tab-sync"
        hidden={aba !== 'sync'}
      >
        {aba === 'sync' && <SecaoSyncLog />}
      </div>
    </main>
  );
}
